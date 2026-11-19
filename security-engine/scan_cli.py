"""Read one JSON request on stdin and return the standalone scan result."""
import json
import sys

from security import scan_prompt


def main():
    data = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    result = scan_prompt(data["prompt"])
    safe_result = {
        "risk_score": result["risk_score"],
        "risk_level": result["risk_level"],
        "decision": result["decision"],
        "threats": sorted({item["type"] for item in result["threats"]}),
        "masked_prompt": result["masked_prompt"],
    }
    print(json.dumps(safe_result, ensure_ascii=True))


if __name__ == "__main__":
    main()
