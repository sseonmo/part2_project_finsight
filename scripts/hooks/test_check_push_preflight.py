"""check_push_preflight hook 테스트."""

import io
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_push_preflight as hook  # noqa: E402


def _payload(command: str, tool_name: str = "Bash") -> str:
    return json.dumps({
        "hook_event_name": "PreToolUse",
        "tool_name": tool_name,
        "tool_input": {"command": command},
    })


def _run(monkeypatch, capsys, raw: str) -> tuple[int, str]:
    monkeypatch.setattr(sys, "stdin", io.StringIO(raw))
    code = hook.main()
    return code, capsys.readouterr().err


# ---------------------------------------------------------------------------
# is_push_command
# ---------------------------------------------------------------------------

class TestIsPushCommand:
    @pytest.mark.parametrize("command", [
        "git push",
        "git push origin main",
        "git  push   origin main --tags",
        "cd /repo && git push",
        "git commit -m 'x' && git push origin main",
    ])
    def test_real_pushes_are_detected(self, command):
        assert hook.is_push_command(command) is True

    @pytest.mark.parametrize("command", [
        "git status",
        "git pushed-branch-name",
        "npm run push",
        "echo 'git push' >> notes.md",
        # --dry-run 은 원격을 바꾸지 않으므로 검사할 이유가 없다.
        "git push --dry-run origin main",
    ])
    def test_non_pushes_are_ignored(self, command):
        assert hook.is_push_command(command) is False


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

class TestMain:
    def test_non_bash_tool_passes_without_running_preflight(self, monkeypatch, capsys):
        def fail(*_args, **_kwargs):
            raise AssertionError("preflight 를 부르면 안 된다")

        monkeypatch.setattr(hook, "run_preflight", fail)
        code, _ = _run(monkeypatch, capsys, _payload("git push", tool_name="Read"))
        assert code == 0

    def test_non_push_command_passes_without_running_preflight(self, monkeypatch, capsys):
        def fail(*_args, **_kwargs):
            raise AssertionError("preflight 를 부르면 안 된다")

        monkeypatch.setattr(hook, "run_preflight", fail)
        code, _ = _run(monkeypatch, capsys, _payload("git status"))
        assert code == 0

    def test_clean_preflight_lets_the_push_through(self, monkeypatch, capsys):
        monkeypatch.setattr(hook, "run_preflight", lambda: (True, "up to date"))
        code, _ = _run(monkeypatch, capsys, _payload("git push origin main"))
        assert code == 0

    def test_drifted_schema_blocks_the_push(self, monkeypatch, capsys):
        monkeypatch.setattr(
            hook, "run_preflight", lambda: (False, "미적용 마이그레이션 3개")
        )
        code, err = _run(monkeypatch, capsys, _payload("git push origin main"))
        assert code == hook.BLOCK_EXIT_CODE
        assert "미적용 마이그레이션 3개" in err
        # 막기만 하고 방법을 알려주지 않으면 다음 행동이 막막해진다.
        assert "supabase db push" in err

    def test_escape_hatch_env_skips_the_check(self, monkeypatch, capsys):
        def fail(*_args, **_kwargs):
            raise AssertionError("SKIP_PUSH_PREFLIGHT 가 켜지면 부르면 안 된다")

        monkeypatch.setattr(hook, "run_preflight", fail)
        monkeypatch.setenv("SKIP_PUSH_PREFLIGHT", "1")
        code, _ = _run(monkeypatch, capsys, _payload("git push origin main"))
        assert code == 0

    def test_broken_payload_does_not_block(self, monkeypatch, capsys):
        code, err = _run(monkeypatch, capsys, "not json")
        assert code == 0
        assert "WARN" in err
