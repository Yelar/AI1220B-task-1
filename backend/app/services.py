from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
import re
from textwrap import shorten
from typing import Protocol

import json

import httpx
from fastapi import HTTPException, status

from app.config import settings
from app.schemas import AIInvokeRequest
from app.prompts import build_prompt_bundle


@dataclass(slots=True)
class AIResult:
    prompt: str
    output_text: str
    model_name: str
    provider: str
    mocked: bool


class AIProvider(Protocol):
    async def complete(self, payload: AIInvokeRequest) -> AIResult: ...

    async def stream(self, payload: AIInvokeRequest) -> AsyncIterator[str]: ...


LEADING_WRAPPER_PATTERNS = [
    r"^(?:here(?:'s| is)\s+(?:your|the)\s+(?:rewritten|revised|translated|restructured|summarized)\s+text\s*:\s*)",
    r"^(?:here(?:'s| is)\s+(?:a|the)\s+summary\s*:\s*)",
    r"^(?:rewritten|revised|translated|restructured|summarized)\s+text\s*:\s*",
    r"^(?:summary|translation|rewrite|restructured\s+version|restructure)\s*:\s*",
    r"^(?:concise\s+summary\s+of\s+the\s+selected\s+text\s*:\s*)",
    r"^(?:result|output)\s*:\s*",
]

_provider: AIProvider | None = None


def build_lm_studio_chat_url() -> str:
    base_url = settings.lm_studio_base_url.rstrip("/")
    if base_url.endswith("/chat/completions"):
        return base_url
    if base_url.endswith("/v1"):
        return f"{base_url}/chat/completions"
    return f"{base_url}/v1/chat/completions"


def build_prompt(payload: AIInvokeRequest) -> str:
    return build_prompt_bundle(payload).user


def build_ai_messages(payload: AIInvokeRequest) -> list[dict[str, str]]:
    prompt = build_prompt_bundle(payload)
    return [
        {"role": "system", "content": prompt.system},
        {"role": "user", "content": prompt.user},
    ]


def sanitize_model_output(content: str) -> str:
    cleaned = content.strip()

    if cleaned.startswith("```") and cleaned.endswith("```"):
        lines = cleaned.splitlines()
        if len(lines) >= 3:
            cleaned = "\n".join(lines[1:-1]).strip()

    changed = True
    while changed:
        changed = False
        for pattern in LEADING_WRAPPER_PATTERNS:
            updated = re.sub(pattern, "", cleaned, flags=re.IGNORECASE).strip()
            if updated != cleaned:
                cleaned = updated
                changed = True

    if "\n\n" in cleaned:
        first_line, remainder = cleaned.split("\n\n", 1)
        lowered = first_line.strip().lower()
        if (
            lowered.endswith(":")
            or lowered.startswith("here is")
            or lowered.startswith("here's")
            or lowered.startswith("summary")
            or lowered.startswith("translation")
            or lowered.startswith("rewrite")
            or lowered.startswith("result")
        ):
            cleaned = remainder.strip()

    cleaned = cleaned.strip().strip('"').strip("'").strip()
    return cleaned


def _extract_completion_text(data: object) -> str:
    try:
        return str(
            data["choices"][0]["message"]["content"]  # type: ignore[index]
        ).strip()
    except (KeyError, IndexError, TypeError):
        return ""


def _extract_stream_chunk(line_payload: object) -> str:
    try:
        choice = line_payload["choices"][0]  # type: ignore[index]
        delta = choice.get("delta") if isinstance(choice, dict) else None
        if isinstance(delta, dict):
            chunk = delta.get("content")
            if isinstance(chunk, str):
                return chunk
        if isinstance(choice, dict):
            message = choice.get("message")
            if isinstance(message, dict):
                chunk = message.get("content")
                if isinstance(chunk, str):
                    return chunk
            chunk = choice.get("text")
            if isinstance(chunk, str):
                return chunk
    except (KeyError, IndexError, TypeError):
        return ""
    return ""


def _chunk_mock_response(text: str) -> AsyncIterator[str]:
    async def generator() -> AsyncIterator[str]:
        chunk_size = 18
        for index in range(0, len(text), chunk_size):
            yield text[index : index + chunk_size]

    return generator()


class LMStudioProvider:
    def _build_request_body(self, payload: AIInvokeRequest, *, stream: bool) -> dict[str, object]:
        return {
            "model": settings.lm_studio_model,
            "messages": build_ai_messages(payload),
            "temperature": 0.3,
            "stream": stream,
        }

    async def complete(self, payload: AIInvokeRequest) -> AIResult:
        prompt = build_prompt(payload)

        if settings.llm_mock:
            mock_response = (
                f"[MOCK {payload.feature.upper()} RESPONSE]\n"
                f"{shorten(payload.selected_text, width=180, placeholder='...')}"
            )
            return AIResult(
                prompt=prompt,
                output_text=mock_response,
                model_name="mock-model",
                provider="mock",
                mocked=True,
            )

        request_body = self._build_request_body(payload, stream=False)
        try:
            async with httpx.AsyncClient(timeout=settings.lm_studio_timeout_seconds) as client:
                response = await client.post(
                    build_lm_studio_chat_url(),
                    json=request_body,
                )
                response.raise_for_status()
        except httpx.ConnectError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "Could not connect to LM Studio. Make sure the local server is running at "
                    f"{settings.lm_studio_base_url}."
                ),
            ) from exc
        except httpx.TimeoutException as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "LM Studio did not respond before the timeout. Increase "
                    "`LM_STUDIO_TIMEOUT_SECONDS` or use a smaller local model."
                ),
            ) from exc
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "LM Studio returned an HTTP error "
                    f"({exc.response.status_code}). Check the loaded model name and server state."
                ),
            ) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="LM Studio request failed for an unexpected network reason.",
            ) from exc

        try:
            data = response.json()
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="LM Studio returned invalid JSON.",
            ) from exc

        content = sanitize_model_output(_extract_completion_text(data))
        if not content:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="LM Studio returned an empty completion.",
            )

        return AIResult(
            prompt=prompt,
            output_text=content,
            model_name=settings.lm_studio_model,
            provider="lm-studio",
            mocked=False,
        )

    async def stream(self, payload: AIInvokeRequest) -> AsyncIterator[str]:
        if settings.llm_mock:
            mock_response = (
                f"[MOCK {payload.feature.upper()} RESPONSE]\n"
                f"{shorten(payload.selected_text, width=180, placeholder='...')}"
            )
            async for chunk in _chunk_mock_response(mock_response):
                yield chunk
            return

        request_body = self._build_request_body(payload, stream=True)
        try:
            async with httpx.AsyncClient(timeout=settings.lm_studio_timeout_seconds) as client:
                async with client.stream(
                    "POST",
                    build_lm_studio_chat_url(),
                    json=request_body,
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        if line.startswith("data:"):
                            data = line.removeprefix("data:").strip()
                            if data == "[DONE]":
                                break
                            try:
                                parsed = json.loads(data)
                            except json.JSONDecodeError:
                                continue
                            chunk = _extract_stream_chunk(parsed)
                            if chunk:
                                yield chunk
        except httpx.ConnectError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "Could not connect to LM Studio. Make sure the local server is running at "
                    f"{settings.lm_studio_base_url}."
                ),
            ) from exc
        except httpx.TimeoutException as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "LM Studio did not respond before the timeout. Increase "
                    "`LM_STUDIO_TIMEOUT_SECONDS` or use a smaller local model."
                ),
            ) from exc
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "LM Studio returned an HTTP error "
                    f"({exc.response.status_code}). Check the loaded model name and server state."
                ),
            ) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="LM Studio request failed for an unexpected network reason.",
            ) from exc


def get_ai_provider() -> AIProvider:
    global _provider
    if _provider is None:
        _provider = LMStudioProvider()
    return _provider


async def generate_ai_suggestion(payload: AIInvokeRequest) -> AIResult:
    return await get_ai_provider().complete(payload)


async def stream_ai_suggestion(payload: AIInvokeRequest) -> AsyncIterator[str]:
    async for chunk in get_ai_provider().stream(payload):
        yield chunk
