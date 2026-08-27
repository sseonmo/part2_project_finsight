#!/usr/bin/env python3
"""PreToolUse hook — 스키마가 밀린 채로 `git push` 하는 것을 막는다.

이 저장소는 코드만 자동 배포되고 마이그레이션은 수동이다(`supabase db push`).
그 수동 단계를 아무도 상기시키지 않아 2026-08-17~25 사이 10개가 조용히 밀렸다.
push 직전이 그 사실을 알아차릴 수 있는 마지막 지점이라 여기서 검사한다.

stdin 으로 hook payload(JSON)를 받아 `tool_input.command` 가 실제 push 인지 보고,
맞으면 `scripts/preflight.sh --fast` 로 원격 스키마를 확인한다.
걸리면 exit 2 와 stderr 로 차단 사유를 알린다(2 만 차단으로 해석된다).

검사를 건너뛰려면 `SKIP_PUSH_PREFLIGHT=1` 을 붙인다.
"""

import json
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path

BLOCK_EXIT_CODE = 2
PREFLIGHT = Path(__file__).resolve().parent.parent / "preflight.sh"
PREFLIGHT_TIMEOUT_SEC = 90

# `cd x && git push` 처럼 이어붙인 명령에서 각 조각을 따로 본다.
SEGMENT_SEPARATOR = re.compile(r"&&|\|\||;|\|")


def is_push_command(command: str) -> bool:
    """명령 안에 실제로 원격을 바꾸는 `git push` 가 들어 있는지 본다.

    `echo 'git push'` 나 `git pushed-branch` 처럼 문자열만 닮은 것은 걸러야 하므로
    조각의 **앞 두 토큰**으로 판정한다. `--dry-run` 은 원격을 바꾸지 않으니 뺀다.
    """
    for segment in SEGMENT_SEPARATOR.split(command):
        try:
            tokens = shlex.split(segment)
        except ValueError:
            tokens = segment.split()

        if tokens[:2] != ["git", "push"]:
            continue

        if "--dry-run" in tokens:
            continue

        return True

    return False


def run_preflight() -> tuple[bool, str]:
    """preflight 를 빠른 모드로 돌려 (통과 여부, 사람이 읽을 사유)를 돌려준다."""
    if not PREFLIGHT.exists():
        return False, f"preflight 스크립트가 없습니다: {PREFLIGHT}"

    try:
        result = subprocess.run(
            ["bash", str(PREFLIGHT), "--fast"],
            capture_output=True,
            text=True,
            timeout=PREFLIGHT_TIMEOUT_SEC,
        )
    except subprocess.TimeoutExpired:
        return False, f"preflight 가 {PREFLIGHT_TIMEOUT_SEC}초 안에 끝나지 않았습니다."

    output = (result.stdout + result.stderr).strip()

    return result.returncode == 0, output


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError, UnicodeDecodeError):
        # hook 자신이 고장났다고 해서 push 를 막지는 않는다.
        print("WARN: hook payload 를 파싱하지 못해 검사를 건너뜁니다.", file=sys.stderr)
        return 0

    if payload.get("tool_name") != "Bash":
        return 0

    tool_input = payload.get("tool_input")
    command = tool_input.get("command", "") if isinstance(tool_input, dict) else ""

    if not is_push_command(command):
        return 0

    if os.environ.get("SKIP_PUSH_PREFLIGHT"):
        return 0

    ok, message = run_preflight()
    if ok:
        return 0

    print(
        "BLOCKED: 원격 스키마가 코드보다 뒤처져 있어 push 를 막았습니다.\n"
        f"{message}\n"
        "\n"
        "먼저 마이그레이션을 적용하세요:\n"
        "  npx supabase db push --dry-run   # 목록 확인\n"
        "  npx supabase db push --yes\n"
        "\n"
        "검사를 건너뛰려면 SKIP_PUSH_PREFLIGHT=1 을 붙여 다시 실행하세요.",
        file=sys.stderr,
    )
    return BLOCK_EXIT_CODE


if __name__ == "__main__":
    sys.exit(main())
