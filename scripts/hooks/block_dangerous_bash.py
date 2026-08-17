#!/usr/bin/env python3
"""Codex PreToolUse hook — 되돌릴 수 없는 shell 명령을 차단한다.

stdin 으로 hook payload(JSON)를 받아 `tool_input.command` 를 검사하고,
위험 패턴에 걸리면 exit 2 와 stderr 로 차단 사유를 알린다.
Codex 는 exit 2 만 차단으로 해석한다 — 다른 코드는 경고일 뿐 명령이 그대로 실행된다.
"""

import json
import re
import sys

BLOCK_EXIT_CODE = 2

DANGEROUS = [
    (r"rm\s+-rf", "rm -rf"),
    (r"git\s+push\s+--force", "git push --force"),
    (r"git\s+reset\s+--hard", "git reset --hard"),
    (r"DROP\s+TABLE", "DROP TABLE"),
]


def find_violation(command: str):
    """걸린 위험 패턴의 이름을 돌려준다. 없으면 None."""
    for pattern, label in DANGEROUS:
        if re.search(pattern, command, re.IGNORECASE):
            return label
    return None


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError, UnicodeDecodeError):
        # hook 자신이 고장났다고 해서 모든 명령을 막지는 않는다.
        # 이 hook 은 실수를 줄이는 장치이지 보안 경계가 아니다.
        print("WARN: hook payload 를 파싱하지 못해 검사를 건너뜁니다.", file=sys.stderr)
        return 0

    if payload.get("tool_name") != "Bash":
        return 0

    tool_input = payload.get("tool_input")
    command = tool_input.get("command", "") if isinstance(tool_input, dict) else ""

    violation = find_violation(command)
    if violation is None:
        return 0

    print(f"BLOCKED: 위험한 명령어가 감지되었습니다 ({violation}).", file=sys.stderr)
    return BLOCK_EXIT_CODE


if __name__ == "__main__":
    sys.exit(main())
