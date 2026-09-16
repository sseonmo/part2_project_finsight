3개 차원(correctness · security · architecture)을 **서브에이전트로 동시에** 돌려 이 프로젝트의 변경을 리뷰하고, 발견마다 **반박 검증**을 거친다.

인수: `$ARGUMENTS`

리뷰 자체는 `.claude/workflows/review-code.js` 워크플로가 수행한다. 이 커맨드는 **대상 정찰 → 워크플로 호출 → 취합·출력**만 담당한다.

---

## 1. 인수 파싱

`$ARGUMENTS` 를 토큰으로 나눈다.

- `--comment` — 있으면 결과를 GitHub PR 에 게시한다. 없으면 터미널에만 출력한다(기본).
- 나머지 토큰 — 리뷰할 파일·디렉터리 경로. 없으면 2단계에서 변경분으로 정한다.

## 2. 대상 정찰

경로 인수가 있으면 그 경로가 대상이다. 없으면 다음으로 정한다.

```bash
git rev-parse --abbrev-ref HEAD          # 현재 브랜치
git diff --name-only main...HEAD         # 브랜치가 main 이 아닐 때만
git diff --name-only                     # unstaged
git diff --name-only --cached            # staged
```

- 현재 브랜치가 `main` 이 아니면 → base 는 `main`, 대상은 `main...HEAD` + uncommitted 를 합집합
- 현재 브랜치가 `main` 이면 → 대상은 uncommitted 만 (staged + unstaged)
- **대상이 0건이면** 리뷰할 것이 없다. 워크플로를 띄우지 말고 그 사실만 알리고 끝낸다.

## 3. 워크플로 실행

`Workflow` 도구를 호출한다. 이 커맨드의 지시가 곧 Workflow 사용 승인이므로 따로 물어보지 않는다.

```
Workflow({
  name: 'review-code',
  args: { base: '<2단계에서 정한 base>', files: [<대상 파일 경로들>], target: '<한 줄 설명>' }
})
```

워크플로는 백그라운드로 돌고 완료 알림이 온다. 기다리는 동안 다른 작업을 시작하지 않는다.

워크플로 안에서 일어나는 일:
- 3개 차원이 동시에 리뷰하고, 각 차원이 끝나는 즉시 그 차원의 발견을 검증한다.
- 검증자는 발견을 **반박하는 쪽**에서 시작한다. 인원은 critical·major 3명(관점을 나눠 과반), minor 1명, nit 은 생략.
- 검증자는 심각도를 **내리기만** 할 수 있다. 검증 후 등급은 확인한 검증자의 **과반이 지지하는 등급**이다(셋이면 가운데 값, 둘이 갈리면 무거운 쪽).

반환되는 각 발견에는 다음 필드가 붙는다.

| 필드 | 값 |
|---|---|
| `verification` | `confirmed` 과반 확인 · `unverified` 검증자가 죽어 과반 미달 · `skipped` nit 이라 생략 |
| `votes` | 확인한 표 수 / 배정 인원 (예: `2/3`) |
| `original_severity` | 검증에서 등급이 내려갔을 때만. 원래 등급 |
| `reasons` | 검증자의 판정 근거 |
| `dimension` | 보고한 차원 |

과반이 반박한 발견은 `findings` 에서 빠지고 `dimensions[].dropped` 로 간다.

## 4. 취합

반환된 `dimensions[].findings` 를 모두 합친 뒤(`dropped` 는 합치지 않는다):

1. **중복 병합** — `file:line` 이 같은 발견은 심각도가 높은 쪽 하나만 남긴다. 남긴 항목의 제목 뒤에 겹친 차원을 병기한다(예: `(security · architecture)`).
2. **정렬** — critical → major → minor → nit. 같은 심각도 안에서는 파일 경로순.
3. **집계** — 심각도별 개수와 검증 상태별 개수(확정·미검증·생략), 기각 건수(`dropped` 합계)를 센다.
4. **판정** — 아래 표대로 결정론적으로 계산한다. 임의로 판단하지 않는다. 등급은 **검증 후 등급**을 쓴다. `unverified` 도 판정에 포함한다 — 검증되지 않았다고 결함이 아닌 것은 아니다.

| 조건 | 판정 |
|---|---|
| critical ≥ 1 | **Blocked** |
| critical 0, major ≥ 1 | **Changes Requested** |
| minor·nit 만 (또는 발견 0건) | **Approve** |

`dimensionsFailed > 0` 이면 판정 줄 아래에 `⚠ <차원> 차원은 실행되지 않았다` 를 반드시 적는다. 실패를 감추면 "3개 차원 다 봤다"로 읽힌다.

## 5. 출력 — 2층

심각도 아이콘: critical 🔴 · major 🟠 · minor 🟡 · nit 🟢

### 층 1 — 라인별 코멘트 (발견 1건당 4줄)

```
[major] 업로드 job 소유자 확인 없이 status 를 갱신한다
TL;DR   service role 로 쓰기 때문에 RLS 가 막지 못한다 — 남의 uploadId 로 호출하면 그대로 통과한다.
✓ Good  서명 검증은 상단에서 이미 통과시켰다.
→ Fix   const { data } = await svc.from('upload_jobs').select('user_id').eq('id', id).single()
        if (data?.user_id !== session.user.id) return NextResponse.json(…, { status: 404 })
```

첫 줄의 `[심각도]` 는 검증 결과에 따라 이렇게 쓴다.

| 상태 | 첫 줄 |
|---|---|
| 확정 | `[major] 제목` |
| 확정 + 등급 하향 | `[minor ← major] 제목` |
| 미검증 | `[major · 미검증] 제목` |
| 검증 생략 (nit) | `[nit] 제목` |

터미널에 출력할 때는 각 코멘트 위에 `src/app/api/uploads/[id]/route.ts:42` 를 붙인다.

### 층 2 — 전체 요약 (1개)

```
판정: Changes Requested    🔴 0 · 🟠 2 · 🟡 3 · 🟢 1
검증: 확정 4 · 미검증 1 · 생략 1 · 기각 2

## walkthrough
(이번 변경이 무엇을 하는지 2~3줄. 3개 차원의 walkthrough 를 합쳐 한 목소리로 쓴다)

## 잘된 점
(dimensions[].praise 를 합쳐 1~3줄. 없으면 이 절을 생략한다)

## critical / major
- 🟠 src/app/api/uploads/[id]/route.ts:42 — 업로드 job 소유자 확인 없이 status 를 갱신한다
- 🟠 src/lib/entitlement.ts:15 — subscription_status 를 직접 비교한다

## 다음 액션
(무엇부터 고칠지 1~3줄. 심각도순이 아니라 의존 순서로 쓴다)

<details><summary>검증에서 기각된 발견 2건</summary>

- src/lib/entitlement.ts:15 — subscription_status 를 직접 비교한다
  기각 근거: 해당 줄은 evaluateEntitlement 내부이며 비교가 허용된 유일한 지점이다 (entitlement.ts:12)
</details>
```

minor·nit 은 요약에 나열하지 않는다. 층 1 에만 남는다.
critical / major 목록에서 미검증 항목은 끝에 `(미검증)` 을 붙인다.
기각된 발견은 층 1 코멘트로 만들지 않는다. 요약의 접힌 절에만 제목과 기각 근거(`reasons` 첫 줄)를 남긴다. 기각이 0건이면 이 절을 생략한다.

## 6. `--comment` — GitHub 게시

`--comment` 가 없으면 5단계 출력으로 끝낸다. **여기서 멈춘다.**

`--comment` 가 있으면:

```bash
gh pr view --json number,url                        # 현재 브랜치의 PR
gh repo view --json nameWithOwner -q .nameWithOwner  # owner/repo
```

**PR 이 없으면** 터미널 출력만 하고 `PR 이 없어 게시를 건너뜁니다` 를 알린 뒤 끝낸다. 리뷰하려고 PR 을 새로 만들지 않는다.

**PR 이 있으면** 인라인과 요약을 **리뷰 1개로 묶어** 게시한다. 코멘트가 흩어지지 않게 한 번에 보낸다.

```bash
gh api repos/{owner}/{repo}/pulls/{number}/reviews --method POST --input <payload.json>
```

payload:
```json
{
  "event": "COMMENT",
  "body": "<층 2 요약>",
  "comments": [
    { "path": "src/...", "line": 42, "side": "RIGHT", "body": "<층 1 4줄>" }
  ]
}
```

### 게시 규칙 3가지

1. **`event` 는 항상 `COMMENT`** 로 보낸다. GitHub 은 자기 PR 에 `APPROVE`/`REQUEST_CHANGES` 를 허용하지 않아 422 로 거절한다. 판정은 요약 본문 첫 줄(`판정: …`)에 텍스트로 남으므로 정보는 잃지 않는다.
2. **`in_diff: false` 인 발견은 `comments` 에 넣지 않는다.** GitHub 은 diff 에 포함된 줄에만 인라인 코멘트를 허용한다. 이 발견들은 요약 하단에 이렇게 모은다:
   ```
   ## 위치 밖 발견 (인라인 불가)
   - 🟠 src/lib/entitlement.ts:15 — subscription_status 를 직접 비교한다
   ```
3. **422 로 실패하면 재시도한다.** `comments` 를 빼고 `body` 만으로 다시 게시하고, 인라인으로 못 붙인 발견 전부를 "위치 밖 발견"에 합친다. 게시 자체를 포기하지 않는다.

게시가 끝나면 PR URL 을 출력한다.

---

## 이 커맨드가 하지 않는 것

- **파일을 수정하지 않는다.** 서브에이전트도 메인도 리뷰 중에는 읽기만 한다. 수정은 사용자가 고칠 항목을 지정한 뒤 별도로 한다.
- PR 을 새로 만들지 않는다.
- 발견을 임의로 걸러내지 않는다. 결과에서 빠지는 것은 검증 과반이 반박한 경우뿐이고, 그것도 요약에 드러낸다.

## 차원을 늘리려면

`.claude/workflows/review-code.js` 의 `DIMENSIONS` 배열에 `{ key, label, focus }` 를 추가한다. fan-out 개수와 검증, 취합은 배열 길이를 따라가므로 이 커맨드는 고치지 않아도 된다.
검증 인원은 같은 파일의 `VOTES` 에서 조정한다. 차원을 늘리면 에이전트 수가 발견 수에 비례해 늘어난다는 점에 유의한다.
남은 후보: performance · conventions · test coverage · cross-file consistency · privacy · CPU/perf patterns · behavioral correctness
