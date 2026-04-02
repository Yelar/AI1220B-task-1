from dataclasses import dataclass
import re
from textwrap import shorten

import httpx
from fastapi import HTTPException, status

from app.config import settings
from app.schemas import AIInvokeRequest


@dataclass(slots=True)
class AIResult:
    prompt: str
    output_text: str
    model_name: str
    provider: str
    mocked: bool


LEADING_WRAPPER_PATTERNS = [
    r"^(?:here(?:'s| is)\s+(?:your|the)\s+(?:rewritten|revised|translated|restructured|summarized)\s+text\s*:\s*)",
    r"^(?:here(?:'s| is)\s+(?:a|the)\s+summary\s*:\s*)",
    r"^(?:rewritten|revised|translated|restructured|summarized)\s+text\s*:\s*",
    r"^(?:summary|translation|rewrite|restructured\s+version|restructure)\s*:\s*",
    r"^(?:concise\s+summary\s+of\s+the\s+selected\s+text\s*:\s*)",
    r"^(?:result|output)\s*:\s*",
]


def build_prompt(payload: AIInvokeRequest) -> str:
    task = {
        "rewrite": "Rewrite the selected text to improve clarity and flow.",
        "summarize": "Summarize the selected text concisely.",
        "translate": f"Translate the selected text into {payload.target_language or 'the requested language'}.",
        "restructure": "Restructure the selected text into a clearer outline while preserving meaning.",
    }[payload.feature]

    context_block = payload.surrounding_context.strip() or "No extra context provided."

    return (
        f"{task}\n\n"
        f"Surrounding context:\n{context_block}\n\n"
        f"Selected text:\n{payload.selected_text}\n"
    )


def build_lm_studio_chat_url() -> str:
    base_url = settings.lm_studio_base_url.rstrip("/")
    if base_url.endswith("/chat/completions"):
        return base_url
    if base_url.endswith("/v1"):
        return f"{base_url}/chat/completions"
    return f"{base_url}/v1/chat/completions"


def sanitize_model_output(content: str) -> str:
    cleaned = content.strip()

    if cleaned.startswith("```") and cleaned.endswith("```"):
        lines = cleaned.splitlines()
        if len(lines) >= 3:
            cleaned = "\n".join(lines[1:-1]).strip()

    cleaned = cleaned.strip().strip('"').strip("'").strip()

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

    return cleaned.strip()


async def generate_ai_suggestion(payload: AIInvokeRequest) -> AIResult:
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

    request_body = {
        "model": settings.lm_studio_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a writing assistant for a collaborative editor. "
                    "Return only the requested resulting text. "
                    "Do not add introductions, labels, explanations, quotation marks, bullet points, or markdown fences."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.3,
    }

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

    try:
        content = data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="LM Studio returned an unexpected response payload.",
        ) from exc
    content = sanitize_model_output(content)
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
