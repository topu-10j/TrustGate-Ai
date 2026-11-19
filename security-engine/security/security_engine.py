"""Central orchestration for the modular Sentinel security detectors."""

import re
from typing import TypedDict

from security.injection_detector import MAX_PROMPT_LENGTH, detect_prompt_injection
from security.jailbreak_detector import detect_jailbreak
from security.risk_scoring import calculate_risk_score, get_decision, get_risk_level
from security.sensitive_data import detect_sensitive_data, mask_sensitive_data


class DetectionResult(TypedDict):
    detected: bool
    threat_type: str | None
    confidence: float
    matched_patterns: list[str]


class Threat(TypedDict, total=False):
    type: str
    confidence: float
    matched_patterns: list[str]
    count: int


_SUSPICIOUS_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "protected_data_exfiltration",
        re.compile(
            r"\b(?:exfiltrate|leak|steal|export|transmit|send|upload)\s+"
            r"(?:(?:the|all|your|our)\s+)?"
            r"(?:protected|confidential|private|internal|customer|user)\s+"
            r"(?:data|information|records?|files?|credentials?)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "confidential_information_access",
        re.compile(
            r"\b(?:access|retrieve|obtain|read|reveal|expose)\s+"
            r"(?:(?:the|all|your)\s+)?"
            r"(?:(?:confidential|private|internal|protected|classified)\s+){1,2}"
            r"(?:data|information|records?|files?|instructions?|documents?)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "unauthorized_action",
        re.compile(
            r"\b(?:access|execute|run|delete|modify|transfer|download)\s+"
            r"(?:(?:the|all|protected|internal)\s+){0,2}"
            r"(?:data|files?|records?|commands?|accounts?|resources?)\s+"
            r"(?:without|before\s+getting)\s+"
            r"(?:authorization|approval|permission|consent)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "security_control_bypass",
        re.compile(
            r"\b(?:bypass|disable|circumvent|evade|turn\s+off)\s+"
            r"(?:(?:the|all|your)\s+)?"
            r"(?:security|access|authorization|safety)\s+"
            r"(?:controls?|checks?|protections?|mechanisms?|requirements?)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "agent_behavior_manipulation",
        re.compile(
            r"\b(?:manipulate|trick|force|instruct|coerce)\s+"
            r"(?:the\s+)?(?:ai|assistant|agent)\s+"
            r"(?:to|into)\s+(?:reveal|disclose|expose|exfiltrate|"
            r"ignore|bypass|execute|access)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "privilege_escalation",
        re.compile(
            r"\b(?:grant|give|assign|escalate)\s+"
            r"(?:my|the\s+user|this\s+account)?\s*"
            r"(?:administrator|admin|root|elevated)\s+"
            r"(?:access|privileges?|permissions?)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "instruction_hierarchy_override",
        re.compile(
            r"\b(?:treat|consider)\s+(?:my|this)\s+"
            r"(?:instruction|message|request)\s+as\s+"
            r"(?:more\s+important|higher\s+priority)\s+"
            r"than\s+(?:the\s+)?(?:system|developer)\b",
            re.IGNORECASE,
        ),
    ),
)

_ACADEMIC_CUE = re.compile(
    r"\b(?:explain|describe|discuss|analy[sz]e|define|"
    r"teach|lesson|research|paper|article|tutorial|example)\b",
    re.IGNORECASE,
)
_SECURITY_CUE = re.compile(
    r"\b(?:security|attack|attacker|threat|cyber|prompt injection|"
    r"authorization|data exfiltration)\b",
    re.IGNORECASE,
)
_ACTIONABLE_ACADEMIC_EXCEPTION = re.compile(
    r"\b(?:attackers?|malware|threat actors?)\s+"
    r"(?:may|might|often|can|sometimes)\s+"
    r"(?:try\s+to\s+)?$",
    re.IGNORECASE,
)
_ACTIONABLE_FOLLOWUP = re.compile(
    r"\b(?:(?:and|then)\s+)?(?:now\s+)?(?:please\s+)?"
    r"(?:do|execute|perform|follow)\s+(?:it|that|so)\b",
    re.IGNORECASE,
)


def detect_suspicious_instruction(prompt: str) -> DetectionResult:
    """Detect contextual requests for unauthorized actions or data access."""
    _validate_prompt(prompt, reject_empty=True)
    findings: list[str] = []
    for category, pattern in _SUSPICIOUS_PATTERNS:
        for match in pattern.finditer(prompt):
            context_start = max(0, match.start() - 160)
            context_end = min(len(prompt), match.end() + 160)
            context = prompt[context_start:context_end]
            before = prompt[context_start : match.start()]
            followup = prompt[match.end() : min(len(prompt), match.end() + 100)]
            if (
                _ACADEMIC_CUE.search(context)
                and _SECURITY_CUE.search(context)
                and not _ACTIONABLE_FOLLOWUP.search(followup)
                and (
                    match.start() > 0
                    and prompt[match.start() - 1 : match.start()] in {'"', "'", "“", "‘"}
                    and prompt[match.end() : match.end() + 1] in {'"', "'", "”", "’"}
                    or _ACTIONABLE_ACADEMIC_EXCEPTION.search(before)
                )
            ):
                continue
            findings.append(category)
            break

    if findings:
        return {
            "detected": True,
            "threat_type": "SUSPICIOUS_INSTRUCTION",
            "confidence": 0.85,
            "matched_patterns": findings,
        }
    return {
        "detected": False,
        "threat_type": None,
        "confidence": 0.0,
        "matched_patterns": [],
    }


def _validate_prompt(
    prompt: str, reject_empty: bool, check_length: bool = True
) -> None:
    if not isinstance(prompt, str):
        raise TypeError("prompt must be a string")
    if reject_empty and not prompt.strip():
        raise ValueError("prompt must not be empty")
    if check_length and len(prompt) > MAX_PROMPT_LENGTH:
        raise ValueError(
            f"prompt must be at most {MAX_PROMPT_LENGTH} characters long"
        )


def analyze_prompt(prompt: str) -> dict[str, object]:
    """Run all detectors and return a safe, backend-friendly security result.

    Oversized input is rejected without scanning or returning it, using a
    fail-closed BLOCK result. No prompt or sensitive value is logged.
    """
    _validate_prompt(prompt, reject_empty=True, check_length=False)
    if len(prompt) > MAX_PROMPT_LENGTH:
        return {
            "risk_score": 100,
            "risk_level": "CRITICAL",
            "threats": [],
            "decision": "BLOCK",
            "masked_prompt": "",
            "error": "PROMPT_TOO_LONG",
        }

    injection = detect_prompt_injection(prompt)
    jailbreak = detect_jailbreak(prompt)
    suspicious = detect_suspicious_instruction(prompt)
    sensitive = detect_sensitive_data(prompt)

    threats: list[Threat] = []
    for result in (injection, jailbreak, suspicious):
        if result["detected"] and result["threat_type"]:
            threats.append(
                {
                    "type": result["threat_type"],
                    "confidence": result["confidence"],
                    "matched_patterns": result["matched_patterns"],
                }
            )
    for category in sensitive["categories"]:
        count = sum(match["type"] == category for match in sensitive["matches"])
        threats.append(
            {
                "type": category,
                "confidence": 0.95 if category in {"API_KEY", "PASSWORD"} else 0.90,
                "matched_patterns": [category],
                "count": count,
            }
        )

    score = calculate_risk_score(threats)
    return {
        "risk_score": score,
        "risk_level": get_risk_level(score),
        "threats": threats,
        "decision": get_decision(score),
        "masked_prompt": mask_sensitive_data(prompt),
    }