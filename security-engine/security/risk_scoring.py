"""Centralized deterministic threat scoring and response policy."""

from collections.abc import Mapping, Sequence


THREAT_WEIGHTS: dict[str, int] = {
    "PROMPT_INJECTION": 45,
    "JAILBREAK": 50,
    "SUSPICIOUS_INSTRUCTION": 30,
    "API_KEY": 30,
    "PASSWORD": 30,
    "EMAIL": 10,
    "PHONE": 10,
    "OTHER_SENSITIVE_DATA": 20,
}


def _threat_name(threat: object) -> str:
    if isinstance(threat, str):
        return threat
    if isinstance(threat, Mapping):
        for key in ("type", "threat_type", "category"):
            value = threat.get(key)
            if isinstance(value, str):
                return value
    raise TypeError("each threat must be a category string or a mapping")


def calculate_risk_score(threats: list) -> int:
    """Calculate a capped score from unique threat categories.

    The strongest category contributes its full weight. Each additional,
    distinct category contributes half its weight (rounded up). Repeated
    instances of the same category do not increase the score, avoiding
    count-driven inflation while still accounting for independent threat types.
    """
    if not isinstance(threats, Sequence) or isinstance(threats, (str, bytes)):
        raise TypeError("threats must be a sequence of threat categories")

    names = {_threat_name(threat) for threat in threats}
    unknown = names.difference(THREAT_WEIGHTS)
    if unknown:
        raise ValueError(f"unknown threat categories: {', '.join(sorted(unknown))}")

    weights = sorted((THREAT_WEIGHTS[name] for name in names), reverse=True)
    if not weights:
        return 0
    score = weights[0] + sum((weight + 1) // 2 for weight in weights[1:])
    return min(score, 100)


def get_risk_level(score: int) -> str:
    """Map a score in the inclusive 0-100 range to its risk band."""
    _validate_score(score)
    if score <= 24:
        return "LOW"
    if score <= 49:
        return "MEDIUM"
    if score <= 74:
        return "HIGH"
    return "CRITICAL"


def get_decision(score: int) -> str:
    """Map LOW to ALLOW, MEDIUM to WARN, and higher risk to BLOCK."""
    level = get_risk_level(score)
    if level == "LOW":
        return "ALLOW"
    if level == "MEDIUM":
        return "WARN"
    return "BLOCK"


def _validate_score(score: int) -> None:
    if isinstance(score, bool) or not isinstance(score, int):
        raise TypeError("score must be an integer")
    if not 0 <= score <= 100:
        raise ValueError("score must be between 0 and 100")