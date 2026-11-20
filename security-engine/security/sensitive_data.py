"""Sensitive-data detection and deterministic masking.

Detection metadata contains categories and spans only; matched values are never
returned or logged by this module.
"""

import re
from typing import TypedDict

from security.injection_detector import MAX_PROMPT_LENGTH


class SensitiveMatch(TypedDict):
    type: str
    placeholder: str
    start: int
    end: int


class SensitiveDataResult(TypedDict):
    detected: bool
    categories: list[str]
    count: int
    matches: list[SensitiveMatch]


_MASKED_PLACEHOLDER = re.compile(r"^\[MASKED_[A-Z_]+\]$")

# Demo token formats are deliberately specific. Generic high-entropy strings
# are not treated as secrets unless preceded by a relevant label.
# Add deployment-approved compiled formats here. Avoid broad patterns that
# classify arbitrary identifiers as credentials.
API_KEY_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bsk-(?:test|demo)-[A-Za-z0-9_-]{8,}\b", re.IGNORECASE),
    re.compile(r"\bapi_(?:test|demo)_[A-Za-z0-9_-]{8,}\b", re.IGNORECASE),
    re.compile(r"\btest_api_key_[A-Za-z0-9_-]{8,}\b", re.IGNORECASE),
    re.compile(
        r"\b(?:api[_ -]?key|client[_ -]?secret)\s*[:=]\s*"
        r"""(?:["'](?P<quoted>[A-Za-z0-9._~+/-]{8,256})["']|"""
        r"(?P<plain>[A-Za-z0-9][A-Za-z0-9._~+/-]{7,255}))",
        re.IGNORECASE,
    ),
)

_PASSWORD_PATTERN = re.compile(
    r"\b(?:password|passwd|passphrase|secret)[ \t]*[:=][ \t]*"
    r"""(?:"(?P<double>[^"\r\n]+)"|'(?P<single>[^'\r\n]+)'|"""
    r"""(?P<plain>(?!["'])\S{4,}))""",
    re.IGNORECASE,
)

_MARKDOWN_EMAIL_PATTERN = re.compile(
    r"\[(?P<display>[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+)\]"
    r"\(mailto:(?P<target>[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+)\)",
    re.IGNORECASE,
)

_EMAIL_PATTERN = re.compile(
    r"\b[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+\b"
)

_BANGLADESHI_PHONE_PATTERN = re.compile(
    r"(?<!\d)(?:\+?8801|01)[3-9]\d{8}(?!\d)"
)

_OTHER_SENSITIVE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----"
        r"[\s\S]*?(?:-----END (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----|\Z)",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:demo[_ -]?token|access[_ -]?token|token)\s*[:=]\s*"
        r"""(?:["'](?P<quoted>[A-Za-z0-9._~+/-]{8,256})["']|"""
        r"(?P<plain>[A-Za-z0-9][A-Za-z0-9._~+/-]{7,255}))",
        re.IGNORECASE,
    ),
    re.compile(r"\btest_user_[A-Za-z0-9_-]{4,64}\b", re.IGNORECASE),
)

_PLACEHOLDERS = {
    "API_KEY": "[MASKED_API_KEY]",
    "PASSWORD": "[MASKED_PASSWORD]",
    "EMAIL": "[MASKED_EMAIL]",
    "PHONE": "[MASKED_PHONE]",
    "OTHER_SENSITIVE_DATA": "[MASKED_OTHER]",
}


def _validate_prompt(prompt: str) -> None:
    if not isinstance(prompt, str):
        raise TypeError("prompt must be a string")
    if not prompt.strip():
        raise ValueError("prompt must not be empty")
    if len(prompt) > MAX_PROMPT_LENGTH:
        raise ValueError(
            f"prompt must be at most {MAX_PROMPT_LENGTH} characters long"
        )


def _captured_value_span(match: re.Match[str]) -> tuple[int, int] | None:
    for group_name in ("quoted", "plain", "double", "single"):
        try:
            start, end = match.span(group_name)
        except IndexError:
            continue
        if start >= 0:
            value = match.group(group_name)
            if (
                value
                and not _MASKED_PLACEHOLDER.fullmatch(value)
                and value.strip("*")
            ):
                return start, end
    return None


def _collect_matches(prompt: str) -> list[SensitiveMatch]:
    candidates: list[SensitiveMatch] = []

    def add(category: str, start: int, end: int) -> None:
        if start < 0 or end <= start:
            return
        candidates.append(
            {
                "type": category,
                "placeholder": _PLACEHOLDERS[category],
                "start": start,
                "end": end,
            }
        )

    for pattern in API_KEY_PATTERNS:
        for match in pattern.finditer(prompt):
            span = _captured_value_span(match)
            if span:
                add("API_KEY", *span)
            else:
                add("API_KEY", match.start(), match.end())

    for match in _PASSWORD_PATTERN.finditer(prompt):
        span = _captured_value_span(match)
        if span:
            add("PASSWORD", *span)

    for match in _MARKDOWN_EMAIL_PATTERN.finditer(prompt):
        add("EMAIL", match.start(), match.end())
    for match in _EMAIL_PATTERN.finditer(prompt):
        add("EMAIL", match.start(), match.end())

    for match in _BANGLADESHI_PHONE_PATTERN.finditer(prompt):
        add("PHONE", match.start(), match.end())

    for pattern in _OTHER_SENSITIVE_PATTERNS:
        for match in pattern.finditer(prompt):
            span = _captured_value_span(match)
            if span:
                add("OTHER_SENSITIVE_DATA", *span)
            elif match.end() > match.start():
                add("OTHER_SENSITIVE_DATA", match.start(), match.end())

    # Prefer the largest match at a given offset (e.g. a full mailto link over
    # either email substring), then discard all overlapping duplicates.
    candidates.sort(key=lambda item: (item["start"], -(item["end"] - item["start"])))
    selected: list[SensitiveMatch] = []
    for candidate in candidates:
        if selected and candidate["start"] < selected[-1]["end"]:
            selected[-1]["end"] = max(selected[-1]["end"], candidate["end"])
            continue
        selected.append(candidate)
    return selected



def detect_sensitive_data(prompt: str) -> SensitiveDataResult:
    """Find supported sensitive values without returning their contents."""
    _validate_prompt(prompt)
    matches = _collect_matches(prompt)
    categories = list(dict.fromkeys(match["type"] for match in matches))
    return {
        "detected": bool(matches),
        "categories": categories,
        "count": len(matches),
        "matches": matches,
    }


def mask_sensitive_data(prompt: str) -> str:
    """Replace supported sensitive values with safe category placeholders."""
    _validate_prompt(prompt)
    matches = _collect_matches(prompt)
    masked = prompt
    for match in reversed(matches):
        masked = (
            masked[: match["start"]]
            + match["placeholder"]
            + masked[match["end"] :]
        )
    return masked