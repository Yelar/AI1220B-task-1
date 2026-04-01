from textwrap import shorten

import httpx
from fastapi import HTTPException, status

from app.config import settings
from app.schemas import AIInvokeRequest


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


async def generate_ai_suggestion(payload: AIInvokeRequest) -> tuple[str, str, str]:
    prompt = build_prompt(payload)

    if settings.llm_mock:
        mock_response = (
            f"[MOCK {payload.feature.upper()} RESPONSE]\n"
            f"{shorten(payload.selected_text, width=180, placeholder='...')}"
        )
        return prompt, mock_response, "mock-model"

    request_body = {
        "model": settings.lm_studio_model,
        "messages": [
            {
                "role": "system",
                "content": "You are a helpful writing assistant for a collaborative editor.",
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.3,
    }

    try:
        async with httpx.AsyncClient(timeout=settings.lm_studio_timeout_seconds) as client:
            response = await client.post(
                f"{settings.lm_studio_base_url.rstrip('/')}/chat/completions",
                json=request_body,
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="LM Studio request failed. Check the local server and model settings.",
        ) from exc

    data = response.json()
    try:
        content = data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="LM Studio returned an unexpected response payload.",
        ) from exc

    return prompt, content, settings.lm_studio_model
