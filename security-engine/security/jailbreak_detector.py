"""Detection of common jailbreak and safety-bypass instructions."""

import re
from typing import TypedDict

from security.injection_detector import MAX_PROMPT_LENGTH


class JailbreakResult(TypedDict):
    detected: bool
    threat_type: str | None
    confidence: float
    matched_patterns: list[str]


_JAILBREAK_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "dan_mode_activation",
        re.compile(
            r"\b(?:activate|enable|enter|switch\s+to|act\s+as|become)\s+"
            r"(?:the\s+)?(?:dan|do\s+anything\s+now)(?:\s+mode)?\b",
            re.IGNORECASE,
        ),
    ),
    (
        "developer_mode_activation",
        re.compile(
            r"\b(?:activate|enable|enter|switch\s+to)\s+"
            r"(?:the\s+)?developer\s+mode\b",
            re.IGNORECASE,
        ),
    ),
    (
        "unrestricted_mode",
        re.compile(
            r"\b(?:activate|enable|enter|switch\s+to|act\s+as|become)\s+"
            r"(?:an?\s+)?(?:unrestricted|uncensored|unfiltered|"
            r"no[- ]limits?)"
            r"(?:\s+(?:ai|assistant|chatbot))?(?:\s+mode)?\b",
            re.IGNORECASE,
        ),
    ),
    (
        "safety_policy_evasion",
        re.compile(
            r"\b(?:ignore|disregard|disable|turn\s+off|bypass|remove)\s+"
            r"(?:(?:all|the|your)\s+)?"
            r"(?:ai\s+)?(?:safety|content|ethical)\s+"
            r"(?:policies|policy|filters?|restrictions?|limitations?)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "restriction_free_roleplay",
        re.compile(
            r"\b(?:pretend|act|behave)\s+(?:as\s+if\s+)?"
            r"(?:you\s+(?:have|are)|as\s+(?:an?\s+)?(?:ai\s+)?with)\s+"
            r"no\s+(?:rules?|restrictions?|limits?)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "content_restriction_bypass",
        re.compile(
            r"\b(?:bypass|circumvent|ignore|remove)\s+"
            r"(?:(?:all|the|your)\s+)?"
            r"(?:content|safety|usage)\s+restrictions?\b",
            re.IGNORECASE,
        ),
    ),
    (
        "never_refuse_instruction",
        re.compile(
            r"\b(?:never|do\s+not|don't)\s+"
            r"(?:refuse|decline)\s+(?:any|a|the|my)?\s*"
            r"(?:request|instruction)?\b",
            re.IGNORECASE,
        ),
    ),
    (
        "ethical_limits_removal",
        re.compile(
            r"\b(?:remove|discard|ignore|disable)\s+"
            r"(?:(?:all|your|the)\s+)?"
            r"(?:ethical|moral)\s+(?:limits?|limitations?|guidelines?)\b",
            re.IGNORECASE,
        ),
    ),
)

_EDUCATIONAL_CUE = re.compile(
    r"\b(?:explain|describe|discuss|analy[sz]e|define|"
    r"teach|study|research|article|paper|lesson|tutorial|"
    r"example|phrase|pattern|meaning|history)\b",
    re.IGNORECASE,
)

_JAILBREAK_TOPIC = re.compile(
    r"\b(?:jailbreak|dan\s+mode|developer\s+mode|"
    r"unrestricted\s+mode|safety\s+filters?|safety\s+policies)\b",
    re.IGNORECASE,
)

_ACTIONABLE_FOLLOWUP = re.compile(
    r"\b(?:(?:and|then)\s+)?(?:now\s+)?(?:please\s+)?"
    r"(?:do|execute|perform|follow)\s+(?:it|that|so)\b",
    re.IGNORECASE,
)


def _is_quoted(prompt: str, start: int, end: int) -> bool:
    return prompt[start - 1 : start] in {'"', "'", "“", "‘"} and prompt[
        end : end + 1
    ] in {'"', "'", "”", "’"}


def _is_educational_mention(prompt: str, start: int, end: int) -> bool:
    """Suppress quoted or clearly descriptive mentions, not active commands."""
    followup = prompt[end : min(len(prompt), end + 100)]
    if _ACTIONABLE_FOLLOWUP.search(followup):
        return False

    context = prompt[max(0, start - 160) : min(len(prompt), end + 160)]
    if not (_EDUCATIONAL_CUE.search(context) and _JAILBREAK_TOPIC.search(context)):
        return False
    if _is_quoted(prompt, start, end):
        prefix = prompt[max(0, start - 160) : start]
        if not re.search(
            r"\b(?:follow|obey|execute|use)\s+(?:this\s+)?"
            r"(?:quoted\s+)?(?:instruction|command)\b",
            prefix,
            re.IGNORECASE,
        ):
            return True

    before = prompt[max(0, start - 160) : start]
    after = prompt[end : min(len(prompt), end + 160)]
    descriptive_lead = re.search(
        r"\b(?:phrase|example|command|instruction)\s+"
        r"(?:such\s+as|like|including|that\s+says)?\s*$",
        before,
        re.IGNORECASE,
    )
    descriptive_tail = re.match(
        r"\s*(?:is|means|describes|refers\s+to)\b",
        after,
        re.IGNORECASE,
    )
    return bool(descriptive_lead or descriptive_tail)


def detect_jailbreak(prompt: str) -> JailbreakResult:
    """Detect common attempts to disable safeguards or assume unrestricted mode.

    Invalid input raises ``TypeError`` or ``ValueError``. Detection confidence
    is a heuristic signal rather than a calibrated probability.
    """
    if not isinstance(prompt, str):
        raise TypeError("prompt must be a string")
    if not prompt.strip():
        raise ValueError("prompt must not be empty")
    if len(prompt) > MAX_PROMPT_LENGTH:
        raise ValueError(
            f"prompt must be at most {MAX_PROMPT_LENGTH} characters long"
        )

    matched_patterns: list[str] = []
    for category, pattern in _JAILBREAK_PATTERNS:
        for match in pattern.finditer(prompt):
            if not _is_educational_mention(prompt, match.start(), match.end()):
                matched_patterns.append(category)
                break

    if matched_patterns:
        return {
            "detected": True,
            "threat_type": "JAILBREAK",
            "confidence": 0.90,
            "matched_patterns": matched_patterns,
        }
    return {
        "detected": False,
        "threat_type": None,
        "confidence": 0.0,
        "matched_patterns": [],
    }