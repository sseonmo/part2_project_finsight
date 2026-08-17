"""block_dangerous_bash hook 테스트."""

import io
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import block_dangerous_bash as hook  # noqa: E402


def _payload(command: str) -> str:
    return json.dumps({
        "hook_event_name": "PreToolUse",
        "tool_name": "Bash",
        "tool_input": {"command": command},
    })


def _run(monkeypatch, capsys, raw: str) -> tuple[int, str]:
    monkeypatch.setattr(sys, "stdin", io.StringIO(raw))
    code = hook.main()
    return code, capsys.readouterr().err


# ---------------------------------------------------------------------------
# find_violation
# ---------------------------------------------------------------------------

class TestFindViolation:
    @pytest.mark.parametrize("command", [
        "rm -rf /tmp/x",
        "rm   -rf build",
        "git push --force origin main",
        "git reset --hard HEAD~1",
        "psql -c 'DROP TABLE users'",
    ])
    def test_dangerous_commands_are_flagged(self, command):
        assert hook.find_violation(command) is not None

    @pytest.mark.parametrize("command", [
        "npm run test",
        "git push origin main",
        "git reset HEAD -- file.txt",
        "rm build/output.txt",
        "python3 scripts/execute.py 0-mvp",
    ])
    def test_safe_commands_pass(self, command):
        assert hook.find_violation(command) is None

    def test_case_insensitive(self):
        assert hook.find_violation("drop table accounts") is not None

    def test_returns_matched_label(self):
        assert hook.find_violation("git push --force") == "git push --force"


# ---------------------------------------------------------------------------
# main — 종료 코드 계약
# ---------------------------------------------------------------------------

class TestMain:
    def test_blocks_with_exit_2(self, monkeypatch, capsys):
        """Codex 는 exit 2 를 차단으로 해석한다. 1 이면 그냥 통과한다."""
        code, err = _run(monkeypatch, capsys, _payload("rm -rf /"))
        assert code == 2
        assert "rm -rf" in err

    def test_allows_safe_command(self, monkeypatch, capsys):
        code, _ = _run(monkeypatch, capsys, _payload("npm run lint"))
        assert code == 0

    def test_ignores_non_bash_tools(self, monkeypatch, capsys):
        raw = json.dumps({
            "hook_event_name": "PreToolUse",
            "tool_name": "apply_patch",
            "tool_input": {"command": "rm -rf /"},
        })
        code, _ = _run(monkeypatch, capsys, raw)
        assert code == 0

    def test_malformed_payload_does_not_block(self, monkeypatch, capsys):
        """hook 자신의 고장으로 모든 명령을 막지는 않는다 (fail-open)."""
        code, err = _run(monkeypatch, capsys, "not json at all")
        assert code == 0
        assert err  # 조용히 넘어가지 말고 경고는 남긴다

    def test_missing_tool_input_does_not_block(self, monkeypatch, capsys):
        raw = json.dumps({"hook_event_name": "PreToolUse", "tool_name": "Bash"})
        code, _ = _run(monkeypatch, capsys, raw)
        assert code == 0
