"""Stable public interface for Member 1's backend integration."""

from security.security_engine import analyze_prompt
from security.sensitive_data import mask_sensitive_data


def scan_prompt(prompt: str) -> dict[str, object]:
    """Scan a prompt and return risk, threats, decision, and masked text."""
    return analyze_prompt(prompt)