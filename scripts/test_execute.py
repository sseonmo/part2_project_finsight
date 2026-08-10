"""
execute.py 리팩터링 안전망 테스트.
리팩터링 전후 동작이 동일한지 검증한다.
"""

import json
import os
import subprocess
import sys
import textwrap
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import execute as ex


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_project(tmp_path):
    """phases/, CLAUDE.md, docs/ 를 갖춘 임시 프로젝트 구조."""
    phases_dir = tmp_path / "phases"
    phases_dir.mkdir()

    claude_md = tmp_path / "CLAUDE.md"
    claude_md.write_text("# Rules\n- rule one\n- rule two")

    docs_dir = tmp_path / "docs"
    docs_dir.mkdir()
    (docs_dir / "arch.md").write_text("# Architecture\nSome content")
    (docs_dir / "guide.md").write_text("# Guide\nAnother doc")

    return tmp_path


@pytest.fixture
def phase_dir(tmp_project):
    """step 3개를 가진 phase 디렉토리."""
    d = tmp_project / "phases" / "0-mvp"
    d.mkdir()

    index = {
        "project": "TestProject",
        "phase": "mvp",
        "steps": [
            {"step": 0, "name": "setup", "status": "completed", "summary": "프로젝트 초기화 완료"},
            {"step": 1, "name": "core", "status": "completed", "summary": "핵심 로직 구현"},
            {"step": 2, "name": "ui", "status": "pending"},
        ],
    }
    (d / "index.json").write_text(json.dumps(index, indent=2, ensure_ascii=False))
    (d / "step2.md").write_text("# Step 2: UI\n\nUI를 구현하세요.")

    return d


@pytest.fixture
def top_index(tmp_project):
    """phases/index.json (top-level)."""
    top = {
        "phases": [
            {"dir": "0-mvp", "status": "pending"},
            {"dir": "1-polish", "status": "pending"},
        ]
    }
    p = tmp_project / "phases" / "index.json"
    p.write_text(json.dumps(top, indent=2))
    return p


@pytest.fixture
def executor(tmp_project, phase_dir):
    """테스트용 StepExecutor 인스턴스. git 호출은 별도 mock 필요."""
    with patch.object(ex, "ROOT", tmp_project):
        inst = ex.StepExecutor("0-mvp")
    # 내부 경로를 tmp_project 기준으로 재설정
    inst._root = str(tmp_project)
    inst._phases_dir = tmp_project / "phases"
    inst._phase_dir = phase_dir
    inst._phase_dir_name = "0-mvp"
    inst._index_file = phase_dir / "index.json"
    inst._top_index_file = tmp_project / "phases" / "index.json"
    return inst


# ---------------------------------------------------------------------------
# _stamp (= 이전 now_iso)
# ---------------------------------------------------------------------------

class TestStamp:
    def test_returns_kst_timestamp(self, executor):
        result = executor._stamp()
        assert "+0900" in result

    def test_format_is_iso(self, executor):
        result = executor._stamp()
        dt = datetime.strptime(result, "%Y-%m-%dT%H:%M:%S%z")
        assert dt.tzinfo is not None

    def test_is_current_time(self, executor):
        before = datetime.now(ex.StepExecutor.TZ).replace(microsecond=0)
        result = executor._stamp()
        after = datetime.now(ex.StepExecutor.TZ).replace(microsecond=0) + timedelta(seconds=1)
        parsed = datetime.strptime(result, "%Y-%m-%dT%H:%M:%S%z")
        assert before <= parsed <= after


# ---------------------------------------------------------------------------
# _read_json / _write_json
# ---------------------------------------------------------------------------

class TestJsonHelpers:
    def test_roundtrip(self, tmp_path):
        data = {"key": "값", "nested": [1, 2, 3]}
        p = tmp_path / "test.json"
        ex.StepExecutor._write_json(p, data)
        loaded = ex.StepExecutor._read_json(p)
        assert loaded == data

    def test_save_ensures_ascii_false(self, tmp_path):
        p = tmp_path / "test.json"
        ex.StepExecutor._write_json(p, {"한글": "테스트"})
        raw = p.read_text()
        assert "한글" in raw
        assert "\\u" not in raw

    def test_save_indented(self, tmp_path):
        p = tmp_path / "test.json"
        ex.StepExecutor._write_json(p, {"a": 1})
        raw = p.read_text()
        assert "\n" in raw

    def test_load_nonexistent_raises(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            ex.StepExecutor._read_json(tmp_path / "nope.json")


# ---------------------------------------------------------------------------
# _load_guardrails
# ---------------------------------------------------------------------------

class TestLoadGuardrails:
    def test_loads_claude_md_and_docs(self, executor, tmp_project):
        with patch.object(ex, "ROOT", tmp_project):
            result = executor._load_guardrails()
        assert "# Rules" in result
        assert "rule one" in result
        assert "# Architecture" in result
        assert "# Guide" in result

    def test_sections_separated_by_divider(self, executor, tmp_project):
        with patch.object(ex, "ROOT", tmp_project):
            result = executor._load_guardrails()
        assert "---" in result

    def test_docs_sorted_alphabetically(self, executor, tmp_project):
        with patch.object(ex, "ROOT", tmp_project):
            result = executor._load_guardrails()
        arch_pos = result.index("arch")
        guide_pos = result.index("guide")
        assert arch_pos < guide_pos

    def test_no_claude_md(self, executor, tmp_project):
        (tmp_project / "CLAUDE.md").unlink()
        with patch.object(ex, "ROOT", tmp_project):
            result = executor._load_guardrails()
        assert "CLAUDE.md" not in result
        assert "Architecture" in result

    def test_no_docs_dir(self, executor, tmp_project):
        import shutil
        shutil.rmtree(tmp_project / "docs")
        with patch.object(ex, "ROOT", tmp_project):
            result = executor._load_guardrails()
        assert "Rules" in result
        assert "Architecture" not in result

    def test_empty_project(self, tmp_path):
        with patch.object(ex, "ROOT", tmp_path):
            # executor가 필요 없는 static-like 동작이므로 임시 인스턴스
            phases_dir = tmp_path / "phases" / "dummy"
            phases_dir.mkdir(parents=True)
            idx = {"project": "T", "phase": "t", "steps": []}
            (phases_dir / "index.json").write_text(json.dumps(idx))
            inst = ex.StepExecutor.__new__(ex.StepExecutor)
            result = inst._load_guardrails()
        assert result == ""


# ---------------------------------------------------------------------------
# _build_step_context
# ---------------------------------------------------------------------------

class TestBuildStepContext:
    def test_includes_completed_with_summary(self, phase_dir):
        index = json.loads((phase_dir / "index.json").read_text())
        result = ex.StepExecutor._build_step_context(index)
        assert "Step 0 (setup): 프로젝트 초기화 완료" in result
        assert "Step 1 (core): 핵심 로직 구현" in result

    def test_excludes_pending(self, phase_dir):
        index = json.loads((phase_dir / "index.json").read_text())
        result = ex.StepExecutor._build_step_context(index)
        assert "ui" not in result

    def test_excludes_completed_without_summary(self, phase_dir):
        index = json.loads((phase_dir / "index.json").read_text())
        del index["steps"][0]["summary"]
        result = ex.StepExecutor._build_step_context(index)
        assert "setup" not in result
        assert "core" in result

    def test_empty_when_no_completed(self):
        index = {"steps": [{"step": 0, "name": "a", "status": "pending"}]}
        result = ex.StepExecutor._build_step_context(index)
        assert result == ""

    def test_has_header(self, phase_dir):
        index = json.loads((phase_dir / "index.json").read_text())
        result = ex.StepExecutor._build_step_context(index)
        assert result.startswith("## 이전 Step 산출물")


# ---------------------------------------------------------------------------
# _build_preamble
# ---------------------------------------------------------------------------

class TestBuildPreamble:
    def test_includes_project_name(self, executor):
        result = executor._build_preamble("", "")
        assert "TestProject" in result

    def test_includes_guardrails(self, executor):
        result = executor._build_preamble("GUARD_CONTENT", "")
        assert "GUARD_CONTENT" in result

    def test_includes_step_context(self, executor):
        ctx = "## 이전 Step 산출물\n\n- Step 0: done"
        result = executor._build_preamble("", ctx)
        assert "이전 Step 산출물" in result

    def test_tells_step_not_to_commit(self, executor):
        result = executor._build_preamble("", "")
        assert "커밋하지 마라" in result
        assert "feat(mvp):" not in result

    def test_includes_rules(self, executor):
        result = executor._build_preamble("", "")
        assert "작업 규칙" in result
        assert "AC" in result

    def test_no_retry_section_by_default(self, executor):
        result = executor._build_preamble("", "")
        assert "이전 시도 실패" not in result

    def test_retry_section_with_prev_error(self, executor):
        result = executor._build_preamble("", "", prev_error="타입 에러 발생")
        assert "이전 시도 실패" in result
        assert "타입 에러 발생" in result

    def test_includes_max_retries(self, executor):
        result = executor._build_preamble("", "")
        assert str(ex.StepExecutor.MAX_RETRIES) in result

    def test_includes_index_path(self, executor):
        result = executor._build_preamble("", "")
        assert "/phases/0-mvp/index.json" in result


# ---------------------------------------------------------------------------
# _update_top_index
# ---------------------------------------------------------------------------

class TestUpdateTopIndex:
    def test_completed(self, executor, top_index):
        executor._top_index_file = top_index
        executor._update_top_index("completed")
        data = json.loads(top_index.read_text())
        mvp = next(p for p in data["phases"] if p["dir"] == "0-mvp")
        assert mvp["status"] == "completed"
        assert "completed_at" in mvp

    def test_error(self, executor, top_index):
        executor._top_index_file = top_index
        executor._update_top_index("error")
        data = json.loads(top_index.read_text())
        mvp = next(p for p in data["phases"] if p["dir"] == "0-mvp")
        assert mvp["status"] == "error"
        assert "failed_at" in mvp

    def test_blocked(self, executor, top_index):
        executor._top_index_file = top_index
        executor._update_top_index("blocked")
        data = json.loads(top_index.read_text())
        mvp = next(p for p in data["phases"] if p["dir"] == "0-mvp")
        assert mvp["status"] == "blocked"
        assert "blocked_at" in mvp

    def test_other_phases_unchanged(self, executor, top_index):
        executor._top_index_file = top_index
        executor._update_top_index("completed")
        data = json.loads(top_index.read_text())
        polish = next(p for p in data["phases"] if p["dir"] == "1-polish")
        assert polish["status"] == "pending"

    def test_nonexistent_dir_is_noop(self, executor, top_index):
        executor._top_index_file = top_index
        executor._phase_dir_name = "no-such-dir"
        original = json.loads(top_index.read_text())
        executor._update_top_index("completed")
        after = json.loads(top_index.read_text())
        for p_before, p_after in zip(original["phases"], after["phases"]):
            assert p_before["status"] == p_after["status"]

    def test_no_top_index_file(self, executor, tmp_path):
        executor._top_index_file = tmp_path / "nonexistent.json"
        executor._update_top_index("completed")  # should not raise


# ---------------------------------------------------------------------------
# _ensure_clean_worktree (mocked)
# ---------------------------------------------------------------------------

class TestCleanWorktree:
    def test_clean_worktree_passes(self, executor):
        executor._run_git = lambda *args: MagicMock(returncode=0, stdout="", stderr="")

        executor._ensure_clean_worktree()

    def test_dirty_worktree_exits(self, executor):
        executor._run_git = lambda *args: MagicMock(returncode=0, stdout=" M plan.md\n", stderr="")

        with pytest.raises(SystemExit) as exc_info:
            executor._ensure_clean_worktree()
        assert exc_info.value.code == 1

    def test_git_status_failure_exits(self, executor):
        executor._run_git = lambda *args: MagicMock(returncode=1, stdout="", stderr="not a git repo")

        with pytest.raises(SystemExit) as exc_info:
            executor._ensure_clean_worktree()
        assert exc_info.value.code == 1

    def _status(self, executor, porcelain: str):
        executor._run_git = lambda *args: MagicMock(returncode=0, stdout=porcelain, stderr="")

    def test_own_step_files_pass(self, executor):
        """D단계가 만든 이번 task의 step 정의는 dirty로 보지 않는다."""
        self._status(executor, "?? phases/0-mvp/step2.md\n?? phases/0-mvp/step3.md\n")

        executor._ensure_clean_worktree()

    def test_top_index_passes(self, executor):
        self._status(executor, "?? phases/index.json\n")

        executor._ensure_clean_worktree()

    def test_modified_task_index_passes(self, executor):
        """에러 복구: index.json의 status를 pending으로 되돌린 뒤 재실행한다."""
        self._status(executor, " M phases/0-mvp/index.json\n")

        executor._ensure_clean_worktree()

    def test_other_task_dir_exits(self, executor):
        """다른 task의 phase 파일은 이번 실행의 소유가 아니다."""
        self._status(executor, "?? phases/1-polish/step1.md\n")

        with pytest.raises(SystemExit) as exc_info:
            executor._ensure_clean_worktree()
        assert exc_info.value.code == 1

    def test_untracked_user_file_exits(self, executor):
        self._status(executor, "?? plan.md\n")

        with pytest.raises(SystemExit) as exc_info:
            executor._ensure_clean_worktree()
        assert exc_info.value.code == 1

    def test_user_file_mixed_with_own_files_exits(self, executor):
        self._status(executor, "?? phases/0-mvp/step2.md\n?? plan.md\n")

        with pytest.raises(SystemExit) as exc_info:
            executor._ensure_clean_worktree()
        assert exc_info.value.code == 1

    def test_error_lists_only_offending_paths(self, executor, capsys):
        """harness 자신의 파일은 에러 출력에 섞이지 않아야 한다."""
        self._status(executor, "?? phases/0-mvp/step2.md\n?? plan.md\n")

        with pytest.raises(SystemExit):
            executor._ensure_clean_worktree()
        out = capsys.readouterr().out
        assert "plan.md" in out
        assert "phases/0-mvp/step2.md" not in out

    def test_hint_mentions_untracked_stash(self, executor, capsys):
        """기본 stash는 untracked를 담지 않으므로 -u를 안내해야 한다."""
        self._status(executor, "?? plan.md\n")

        with pytest.raises(SystemExit):
            executor._ensure_clean_worktree()
        assert "stash -u" in capsys.readouterr().out


# ---------------------------------------------------------------------------
# _checkout_branch (mocked)
# ---------------------------------------------------------------------------

class TestCheckoutBranch:
    def _mock_git(self, executor, responses):
        call_idx = {"i": 0}
        def fake_git(*args):
            idx = call_idx["i"]
            call_idx["i"] += 1
            if idx < len(responses):
                return responses[idx]
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git

    def test_already_on_branch(self, executor):
        self._mock_git(executor, [
            MagicMock(returncode=0, stdout="feat-mvp\n", stderr=""),
        ])
        executor._checkout_branch()  # should return without checkout

    def test_branch_exists_checkout(self, executor):
        self._mock_git(executor, [
            MagicMock(returncode=0, stdout="main\n", stderr=""),
            MagicMock(returncode=0, stdout="", stderr=""),
            MagicMock(returncode=0, stdout="", stderr=""),
        ])
        executor._checkout_branch()

    def test_branch_not_exists_create(self, executor):
        self._mock_git(executor, [
            MagicMock(returncode=0, stdout="main\n", stderr=""),
            MagicMock(returncode=1, stdout="", stderr="not found"),
            MagicMock(returncode=0, stdout="", stderr=""),
        ])
        executor._checkout_branch()

    def test_checkout_fails_exits(self, executor):
        self._mock_git(executor, [
            MagicMock(returncode=0, stdout="main\n", stderr=""),
            MagicMock(returncode=1, stdout="", stderr=""),
            MagicMock(returncode=1, stdout="", stderr="dirty tree"),
        ])
        with pytest.raises(SystemExit) as exc_info:
            executor._checkout_branch()
        assert exc_info.value.code == 1

    def test_no_git_exits(self, executor):
        self._mock_git(executor, [
            MagicMock(returncode=1, stdout="", stderr="not a git repo"),
        ])
        with pytest.raises(SystemExit) as exc_info:
            executor._checkout_branch()
        assert exc_info.value.code == 1


# ---------------------------------------------------------------------------
# _commit_step (mocked)
# ---------------------------------------------------------------------------

class TestCommitStep:
    def test_two_phase_commit(self, executor):
        calls = []
        def fake_git(*args):
            calls.append(args)
            if args[:2] == ("diff", "--cached"):
                return MagicMock(returncode=1)
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git

        executor._commit_step(2, "ui")

        commit_calls = [c for c in calls if c[0] == "commit"]
        assert len(commit_calls) == 2
        assert "feat(mvp):" in commit_calls[0][2]
        assert "chore(mvp):" in commit_calls[1][2]

    def test_no_code_changes_skips_feat_commit(self, executor):
        call_count = {"diff": 0}
        calls = []
        def fake_git(*args):
            calls.append(args)
            if args[:2] == ("diff", "--cached"):
                call_count["diff"] += 1
                if call_count["diff"] == 1:
                    return MagicMock(returncode=0)
                return MagicMock(returncode=1)
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git

        executor._commit_step(2, "ui")

        commit_msgs = [c[2] for c in calls if c[0] == "commit"]
        assert len(commit_msgs) == 1
        assert "chore" in commit_msgs[0]


# ---------------------------------------------------------------------------
# _commit_phase_files (mocked)
# ---------------------------------------------------------------------------

class TestCommitPhaseFiles:
    def _record(self, executor, staged: bool = True):
        calls = []
        def fake_git(*args):
            calls.append(args)
            if args[:2] == ("diff", "--cached"):
                return MagicMock(returncode=1 if staged else 0)
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git
        return calls

    def test_commits_own_phase_files(self, executor, top_index):
        calls = self._record(executor)

        executor._commit_phase_files()

        add_calls = [c for c in calls if c[0] == "add"]
        assert len(add_calls) == 1
        assert "phases/0-mvp" in add_calls[0]
        assert "phases/index.json" in add_calls[0]

        commit_calls = [c for c in calls if c[0] == "commit"]
        assert len(commit_calls) == 1
        assert "chore(mvp):" in commit_calls[0][2]

    def test_does_not_use_add_all(self, executor, top_index):
        """add -A 로 담으면 검사를 통과한 사용자 파일까지 커밋된다."""
        calls = self._record(executor)

        executor._commit_phase_files()

        assert ("add", "-A") not in calls

    def test_skips_missing_top_index(self, executor):
        """phases/index.json 이 없으면 pathspec 에 넣지 않는다 (git add 가 실패한다)."""
        calls = self._record(executor)

        executor._commit_phase_files()

        add_call = next(c for c in calls if c[0] == "add")
        assert "phases/index.json" not in add_call

    def test_nothing_staged_skips_commit(self, executor, top_index):
        """이미 커밋된 상태로 재실행하면 빈 커밋을 만들지 않는다."""
        calls = self._record(executor, staged=False)

        executor._commit_phase_files()

        assert not [c for c in calls if c[0] == "commit"]


# ---------------------------------------------------------------------------
# 실제 git 저장소 통합 테스트
#
# porcelain 은 새 디렉토리를 "?? phases/" 로 축약한다. mock 으로는 재현되지 않아
# 소유 판정이 조용히 무너지므로, 이 구간만 실제 git 으로 검증한다.
# ---------------------------------------------------------------------------

def _git(root, *args):
    subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, check=True)


def _status(root, *extra):
    return subprocess.run(
        ["git", "status", "--porcelain", *extra], cwd=root, capture_output=True, text=True
    ).stdout


@pytest.fixture
def git_repo(tmp_project):
    """CLAUDE.md/docs 만 커밋된 저장소. phases/ 는 통째로 untracked 로 남는다."""
    _git(tmp_project, "init", "-q")
    _git(tmp_project, "config", "user.email", "t@example.com")
    _git(tmp_project, "config", "user.name", "tester")
    _git(tmp_project, "add", "CLAUDE.md", "docs")
    _git(tmp_project, "commit", "-qm", "init")
    return tmp_project


class TestWorktreeWithRealGit:
    def test_untracked_phases_dir_passes(self, executor, git_repo):
        """최초 실행. git 이 '?? phases/' 로 축약해도 통과해야 한다."""
        assert "?? phases/\n" in _status(git_repo)  # 축약이 실제로 일어나는지 먼저 확인

        executor._ensure_clean_worktree()

    def test_user_file_blocks(self, executor, git_repo):
        (git_repo / "plan.md").write_text("draft")

        with pytest.raises(SystemExit) as exc_info:
            executor._ensure_clean_worktree()
        assert exc_info.value.code == 1

    def test_phase_commit_leaves_user_file_in_worktree(self, executor, git_repo, top_index):
        """선커밋은 phases/ 만 담고 사용자 파일은 건드리지 않아야 한다."""
        (git_repo / "plan.md").write_text("draft")

        executor._commit_phase_files()

        committed = subprocess.run(
            ["git", "show", "--name-only", "--format=", "HEAD"],
            cwd=git_repo, capture_output=True, text=True,
        ).stdout
        assert "phases/0-mvp/step2.md" in committed
        assert "phases/index.json" in committed
        assert "plan.md" not in committed
        assert "?? plan.md" in _status(git_repo)

    def test_worktree_empty_when_steps_begin(self, executor, git_repo, top_index):
        """step 루프 진입 시 worktree 가 실제로 비어야 _commit_step 의 add -A 가 안전하다."""
        executor._commit_phase_files()

        assert _status(git_repo, "-uall").strip() == ""


# ---------------------------------------------------------------------------
# run() 호출 순서
# ---------------------------------------------------------------------------

class TestRunOrder:
    def test_phase_files_committed_after_checkout_before_steps(self, executor):
        order = []
        executor._print_header = lambda: None
        executor._check_blockers = lambda: None
        executor._ensure_clean_worktree = lambda: order.append("clean")
        executor._checkout_branch = lambda: order.append("checkout")
        executor._commit_phase_files = lambda: order.append("phase-commit")
        executor._load_guardrails = lambda: ""
        executor._ensure_created_at = lambda: None
        executor._execute_all_steps = lambda guardrails: order.append("steps")
        executor._finalize = lambda: None

        executor.run()

        # 검사는 checkout 전에 — 잘못된 브랜치로 옮겨간 뒤 중단되면 안 된다
        assert order.index("clean") < order.index("checkout")
        # 선커밋은 checkout 후에 — main 이 아니라 feat 브랜치에 찍혀야 한다
        assert order.index("checkout") < order.index("phase-commit")
        # step 루프 전에 worktree 가 비워져야 _commit_step 의 add -A 가 안전하다
        assert order.index("phase-commit") < order.index("steps")


# ---------------------------------------------------------------------------
# _invoke_claude (mocked)
# ---------------------------------------------------------------------------

class TestInvokeClaude:
    def test_invokes_claude_with_correct_args(self, executor):
        mock_result = MagicMock(returncode=0, stdout='{"result": "ok"}', stderr="")
        step = {"step": 2, "name": "ui"}
        preamble = "PREAMBLE\n"

        with patch("subprocess.run", return_value=mock_result) as mock_run:
            output = executor._invoke_claude(step, preamble)

        cmd = mock_run.call_args[0][0]
        assert cmd[0] == "claude"
        assert "-p" in cmd
        assert "--dangerously-skip-permissions" in cmd
        assert "--output-format" in cmd

    def test_prompt_passed_via_stdin(self, executor):
        """프롬프트는 argv가 아닌 stdin으로 전달한다 (ARG_MAX 초과 방지)."""
        mock_result = MagicMock(returncode=0, stdout="{}", stderr="")
        step = {"step": 2, "name": "ui"}

        with patch("subprocess.run", return_value=mock_result) as mock_run:
            executor._invoke_claude(step, "PREAMBLE\n")

        cmd = mock_run.call_args[0][0]
        stdin_input = mock_run.call_args[1]["input"]
        assert "PREAMBLE" in stdin_input
        assert "UI를 구현하세요" in stdin_input
        # argv에는 프롬프트가 포함되지 않아야 한다
        assert all("PREAMBLE" not in arg for arg in cmd)

    def test_timeout_returns_failed_output(self, executor):
        """타임아웃 시 traceback 없이 실패 output을 기록하고 반환한다."""
        step = {"step": 2, "name": "ui"}
        exc = subprocess.TimeoutExpired(cmd="claude", timeout=1800)

        with patch("subprocess.run", side_effect=exc):
            output = executor._invoke_claude(step, "preamble")

        assert output["exitCode"] != 0
        assert "1800" in output["stderr"]

        output_file = executor._phase_dir / "step2-output.json"
        assert output_file.exists()
        data = json.loads(output_file.read_text())
        assert data["exitCode"] != 0

    def test_claude_cli_missing_exits(self, executor):
        """claude CLI가 없으면 깔끔한 에러 메시지와 함께 종료한다."""
        step = {"step": 2, "name": "ui"}

        with patch("subprocess.run", side_effect=FileNotFoundError("claude")):
            with pytest.raises(SystemExit) as exc_info:
                executor._invoke_claude(step, "preamble")
        assert exc_info.value.code == 1

    def test_saves_output_json(self, executor):
        mock_result = MagicMock(returncode=0, stdout='{"ok": true}', stderr="")
        step = {"step": 2, "name": "ui"}

        with patch("subprocess.run", return_value=mock_result):
            executor._invoke_claude(step, "preamble")

        output_file = executor._phase_dir / "step2-output.json"
        assert output_file.exists()
        data = json.loads(output_file.read_text())
        assert data["step"] == 2
        assert data["name"] == "ui"
        assert data["exitCode"] == 0

    def test_nonexistent_step_file_exits(self, executor):
        step = {"step": 99, "name": "nonexistent"}
        with pytest.raises(SystemExit) as exc_info:
            executor._invoke_claude(step, "preamble")
        assert exc_info.value.code == 1

    def test_timeout_is_1800(self, executor):
        mock_result = MagicMock(returncode=0, stdout="{}", stderr="")
        step = {"step": 2, "name": "ui"}

        with patch("subprocess.run", return_value=mock_result) as mock_run:
            executor._invoke_claude(step, "preamble")

        assert mock_run.call_args[1]["timeout"] == 1800


# ---------------------------------------------------------------------------
# _fallback_error
# ---------------------------------------------------------------------------

class TestFallbackError:
    """status 미갱신 시 재시도 프롬프트에 넣을 fallback 에러 메시지 생성."""

    def test_clean_exit_generic_message(self, executor):
        output = {"exitCode": 0, "stdout": "", "stderr": ""}
        assert executor._fallback_error(output) == "Step did not update status"

    def test_abnormal_exit_includes_code_and_stderr(self, executor):
        output = {"exitCode": 137, "stdout": "", "stderr": "out of memory"}
        msg = executor._fallback_error(output)
        assert "137" in msg
        assert "out of memory" in msg

    def test_abnormal_exit_without_stderr(self, executor):
        output = {"exitCode": -1, "stdout": "", "stderr": ""}
        msg = executor._fallback_error(output)
        assert "-1" in msg

    def test_stderr_truncated(self, executor):
        output = {"exitCode": 1, "stdout": "", "stderr": "x" * 5000}
        msg = executor._fallback_error(output)
        assert len(msg) < 1000


# ---------------------------------------------------------------------------
# progress_indicator (= 이전 Spinner)
# ---------------------------------------------------------------------------

class TestProgressIndicator:
    def test_context_manager(self):
        import time
        with ex.progress_indicator("test") as pi:
            time.sleep(0.15)
        assert pi.elapsed >= 0.1

    def test_elapsed_increases(self):
        import time
        with ex.progress_indicator("test") as pi:
            time.sleep(0.2)
        assert pi.elapsed > 0


# ---------------------------------------------------------------------------
# main() CLI 파싱 (mocked)
# ---------------------------------------------------------------------------

class TestMainCli:
    def test_no_args_exits(self):
        with patch("sys.argv", ["execute.py"]):
            with pytest.raises(SystemExit) as exc_info:
                ex.main()
            assert exc_info.value.code == 2  # argparse exits with 2

    def test_invalid_phase_dir_exits(self):
        with patch("sys.argv", ["execute.py", "nonexistent"]):
            with patch.object(ex, "ROOT", Path("/tmp/fake_nonexistent")):
                with pytest.raises(SystemExit) as exc_info:
                    ex.main()
                assert exc_info.value.code == 1

    def test_missing_index_exits(self, tmp_project):
        (tmp_project / "phases" / "empty").mkdir()
        with patch("sys.argv", ["execute.py", "empty"]):
            with patch.object(ex, "ROOT", tmp_project):
                with pytest.raises(SystemExit) as exc_info:
                    ex.main()
                assert exc_info.value.code == 1


# ---------------------------------------------------------------------------
# _check_blockers (= 이전 main() error/blocked 체크)
# ---------------------------------------------------------------------------

class TestCheckBlockers:
    def _make_executor_with_steps(self, tmp_project, steps):
        d = tmp_project / "phases" / "test-phase"
        d.mkdir(exist_ok=True)
        index = {"project": "T", "phase": "test", "steps": steps}
        (d / "index.json").write_text(json.dumps(index))

        with patch.object(ex, "ROOT", tmp_project):
            inst = ex.StepExecutor.__new__(ex.StepExecutor)
        inst._root = str(tmp_project)
        inst._phases_dir = tmp_project / "phases"
        inst._phase_dir = d
        inst._phase_dir_name = "test-phase"
        inst._index_file = d / "index.json"
        inst._top_index_file = tmp_project / "phases" / "index.json"
        inst._phase_name = "test"
        inst._total = len(steps)
        return inst

    def test_error_step_exits_1(self, tmp_project):
        steps = [
            {"step": 0, "name": "ok", "status": "completed"},
            {"step": 1, "name": "bad", "status": "error", "error_message": "fail"},
        ]
        inst = self._make_executor_with_steps(tmp_project, steps)
        with pytest.raises(SystemExit) as exc_info:
            inst._check_blockers()
        assert exc_info.value.code == 1

    def test_blocked_step_exits_2(self, tmp_project):
        steps = [
            {"step": 0, "name": "ok", "status": "completed"},
            {"step": 1, "name": "stuck", "status": "blocked", "blocked_reason": "API key"},
        ]
        inst = self._make_executor_with_steps(tmp_project, steps)
        with pytest.raises(SystemExit) as exc_info:
            inst._check_blockers()
        assert exc_info.value.code == 2
