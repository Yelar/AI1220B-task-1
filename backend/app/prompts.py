from __future__ import annotations

from dataclasses import dataclass

from app.schemas import AIInvokeRequest

MAX_CONTEXT_CHARS = 3500
MAX_SELECTED_CHARS = 6000


@dataclass(slots=True)
class PromptBundle:
    system: str
    user: str


PROMPT_TEMPLATES: dict[str, dict[str, object]] = {
    "rewrite": {
        "task": "Rewrite the selected text to improve clarity, flow, and structure.",
        "rules": [
            "Return only the rewritten text.",
            "Preserve the original meaning unless the user explicitly asked for a change.",
            "Do not add explanations, labels, bullets, or markdown fences.",
        ],
    },
    "summarize": {
        "task": "Summarize the selected text concisely.",
        "rules": [
            "Return only the summary text.",
            "Prefer compact prose unless a list clearly improves readability.",
            "Do not add preambles or labels.",
        ],
    },
    "translate": {
        "task": "Translate the selected text into the requested language.",
        "rules": [
            "Return only the translated text.",
            "Preserve formatting when it helps readability.",
            "Do not explain what you changed.",
        ],
    },
    "restructure": {
        "task": "Restructure the selected text into a clearer version while preserving meaning.",
        "rules": [
            "Return only the restructured text.",
            "Keep terminology faithful to the source unless the user requested simplification.",
            "Do not add labels or commentary.",
        ],
    },
}


def _normalize_text(value: str, *, limit: int) -> str:
    compact = " ".join(value.split()).strip()
    if not compact:
        return ""
    if len(compact) <= limit:
        return compact
    return f"{compact[: max(limit - 1, 0)].rstrip()}…"


def build_prompt_bundle(payload: AIInvokeRequest) -> PromptBundle:
    template = PROMPT_TEMPLATES[payload.feature]
    task = template["task"]
    rules = template["rules"]

    context = payload.surrounding_context.strip() or "No extra context provided."
    context = _normalize_text(context, limit=MAX_CONTEXT_CHARS)
    selected_text = _normalize_text(payload.selected_text, limit=MAX_SELECTED_CHARS)

    target_language = payload.target_language or "the requested language"
    system_prompt = (
        "You are a concise writing assistant for a collaborative document editor. "
        "Always return only the requested resulting text. "
        "Avoid introductions, warnings, labels, markdown fences, and commentary."
    )

    rule_block = "\n".join(f"- {rule}" for rule in rules)
    user_prompt = (
        f"Task:\n{task}\n\n"
        f"Rules:\n{rule_block}\n\n"
        f"Selected text:\n{selected_text}\n\n"
        f"Surrounding context:\n{context}\n"
    )

    if payload.feature == "translate":
        user_prompt += f"\nTarget language:\n{target_language}\n"

    return PromptBundle(system=system_prompt, user=user_prompt)
