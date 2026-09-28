---
name: db-advisor
description: Supabase advisor(get_advisors)로 FinSight 원격 DB 의 보안·성능 경고를 받아 보고서로 보여주고, 사용자가 고른 항목을 마이그레이션 파일 + db push 로 실제 수정한 뒤 재검사로 검증한다. `/db-advisor` 로 명시 호출할 때만 사용한다.
disable-model-invocation: true
---

# db-advisor — advisor 경고를 보고서로 받고, 고른 것만 마이그레이션으로 고친다

이 스킬은 **단일 production DB 에 쓴다.** 그래서 흐름 대부분이 "쓰기 전에 멈출 지점"이다.
실행 중 사용자에게 묻는 것은 두 번뿐이다 — 4단계(고칠 항목)와 6단계(push 재승인).

## 규칙 — 먼저 읽을 것

- **DB 쓰기는 `supabase/migrations/` 파일 + `npx supabase db push` 뿐이다.** MCP 는 `get_advisors` 와
  SELECT 조회에만 쓴다. 세션에 `apply_migration`·`execute_sql` 같은 쓰기 가능한 Supabase 도구가 보여도
  DDL 에 쓰지 않는다. 이유: 파일 없이 원격만 바뀌면 migration history 가 어긋나 다음 `db push` 와
  `git push` 프리플라이트가 깨지고, 아래 테스트 게이트·재승인을 전부 건너뛴다.
- MCP 도구는 서버 이름이 아니라 역할로 찾는다(`get_advisors`, `execute_sql`). 세션마다 서버 접두사가
  다르다. 도구 스키마에 `project_id` 가 있을 때만 `rokvlbizwfdqsmzojesq` 를 넘긴다.
- 재승인은 **질문으로 받는다.** 권한 프롬프트에 기대지 않는다 — bypass 모드에서는 뜨지 않는다.

## 0. 사전 점검

```bash
npx supabase projects list
```

`rokvlbizwfdqsmzojesq` 행의 STATUS 가 `ACTIVE_HEALTHY` 가 아니면 중단하고 안내한다:
"Supabase 대시보드(https://supabase.com/dashboard/project/rokvlbizwfdqsmzojesq)에서 Restore 후 다시
`/db-advisor`". `COMING_UP`·`RESTORING` 도 중단이다 — 복구 직후 몇 분은 advisor 가 실패한다.
명령 자체가 실패하면 로그인·링크 문제다(`npx supabase login`, `npx supabase link`).

`git status` 로 `supabase/migrations/` 에 커밋 안 된 파일이 있는지도 본다. 있으면 6단계 적용 가드에
걸리므로 먼저 처리하라고 알리고 중단한다.

## 1. 수집

`get_advisors` 를 `type: "security"`, `type: "performance"` 로 한 번씩 부른다.

**두 호출이 모두 정상 lint 배열을 돌려줬을 때만 결과로 쓴다.** 오류 문자열·빈 응답·한쪽만 성공은
"검사 실패"로 보고하고 중단한다. 실패를 "0건, 깨끗함"으로 보고하면 이 스킬이 존재하는 의미가 없다.

응답은 `result.lints[]` (lint 단위: `name`, `level`, `remediation`) 안에 `findings[]` (발견 단위: `detail`,
`metadata`) 가 들어 있는 구조다. `cache_key` 같은 고유 ID 는 **없다.**

**발견 키** — allowlist 매칭과 before/after 비교에 쓴다:
`<lint name>:<detail 안의 백틱 식별자들을 등장 순서대로 쉼표로>`
(예: `auth_rls_initplan:public.profiles,profiles_select_own`,
`unused_index:transactions_user_transacted_on_idx,public.transactions`). 백틱 식별자가 없는 발견은
`metadata.entity` 를 쓴다(예: `auth_leaked_password_protection:Auth`). `detail` 에는 `\`` 처럼 이스케이프된
백틱이 오니 벗겨서 읽는다. 정책·인덱스 이름은 `detail` 에만 있으므로 `metadata` 만으로 키를 만들지 않는다.

## 2. 분류

1. 발견 키가 `allowlist.md` 의 키와 정확히 일치 → **확인된 예외**. 매칭 안 된 allowlist 줄은
   **낡은 예외**로 보고서에 한 줄 표시(삭제는 사람이 한다).
2. 마이그레이션으로 못 고치는 lint(auth 설정, Postgres 버전 등 — 원격 auth 설정은 대시보드에서만
   바뀐다) → **대시보드 조치**. 선택지에 넣지 않고 remediation 링크와 절차만 준다.
3. 나머지를 `level`(ERROR/WARN/INFO) 순으로, **같은 lint `name` 은 한 묶음**으로 모은다
   (`auth_rls_initplan` 은 정책마다 한 건씩 수십 건 뜰 수 있다).
4. 묶음마다 원인과 수정안 SQL 초안을 붙인다. 근거는 `supabase/migrations/`, `CLAUDE.md`,
   `supabase/*.test.ts` 를 읽어서 댄다. 추측으로 원인을 쓰지 않는다.

FinSight 에서 판단이 갈리는 곳:
- `rls_enabled_no_policy` 가 `processed_webhook_events` 에 뜨는 것은 **의도**다(service role 전용,
  `supabase/rls.test.ts` 가 정책 부재를 단언). 다른 테이블에 뜨면 코드의 접근 경로를 확인한 뒤 판단한다.
- `unused_index` 는 저트래픽 초기라 오탐이 많다. 선택지에는 넣되 **기본 선택 해제**.
- advisor 권고라도 CLAUDE.md 의 CRITICAL 규칙(전역 캐시 `merchant_categories`, service role 경로,
  `user_id = auth.uid()` RLS)과 충돌하면 수정안을 내지 않고 이유를 적는다.

## 3. 보고서

0건이거나 1단계에서 실패했으면 Artifact 를 만들지 않고 터미널로 끝낸다.
그 외에는 Artifact 로 발행한다(artifact-design 스킬을 먼저 로드). 담을 것:
- 요약: 등급별 건수, 확인된 예외 N, 낡은 예외, 대시보드 조치
- 묶음별 표: lint · 대상 · 원인 · 수정안 SQL · remediation 링크
- **싣지 않는 것**: project ref, API URL, 키. 보고서는 공유될 수 있고 미해결 보안 경고 목록과 식별자가
  한 페이지에 모이면 공격 지도가 된다.

파일은 scratchpad 에 쓰고, 실행마다 새 URL 로 발행한다(7단계는 같은 파일 경로로 갱신).

## 4. 선택 (질문 1)

묶음 단위로 고칠 것을 묻는다(AskUserQuestion multiSelect, 필요하면 여러 번). 선택되지 않은 항목은
"allowlist 에 추가할까?"를 함께 묻고, 추가할 때는 이유를 받아 `allowlist.md` 에 한 줄 쓴다.
아무것도 안 고르면 여기서 끝낸다.

## 5. 수정 — 실행당 마이그레이션 파일 1개

`supabase/migrations/<YYYYMMDDHHMMSS>_db_advisor_fixes.sql` 한 파일에 고른 항목을 섹션으로 나눈다.
버전은 현재 시각이고 기존 최신 버전보다 커야 한다. 한 파일이라 `db push` 가 전부 성공/전부 실패가 되어
부분 적용이 생기지 않는다.

각 섹션:
```sql
-- [lint_name] 대상 — 한 줄 이유
-- before: (execute_sql SELECT 로 조회한 현재 정의 원문 — pg_policies / pg_get_functiondef / pg_indexes)
<수정 SQL>
```

- **원본은 현재 DB 상태다.** 정책·함수를 다시 만들 때 옛 마이그레이션 텍스트를 복사하지 않는다 —
  이후 마이그레이션이 의도적으로 drop 한 정책(예: `*_update_own`)이 되살아난다. advisor 가 이름으로
  지목한 객체만 건드린다.
- `before:` 주석이 롤백 근거다. 롤백은 그 주석으로 **새 forward 마이그레이션**을 쓴다.
- `create index concurrently` 금지 — `db push` 는 트랜잭션 안에서 돌아 실패한다. 테이블이 작으니
  일반 `create index` 로 충분하다.

작성 직후 금지 패턴 검사:
```bash
grep -inE 'security +definer|using *\( *true *\)|with +check *\( *true *\)|to +(anon|public)\b|\bgrant\b|concurrently' <파일>
```
걸린 섹션은 파일에서 빼고 보고서에 "수동 검토 필요"로 옮긴다. `drop policy` 가 있는데 같은 섹션에
`create policy` 가 없어도 마찬가지다. 이유: 보안 lint 를 "고친다"며 권한을 넓히는 수정이 가장 위험하다.
예를 들어 사용자 RPC 는 전부 `p_user_id` 를 받는 SECURITY INVOKER 라, `security definer` 가 붙는 순간
남의 거래를 읽을 수 있게 된다.

섹션이 하나도 남지 않으면 파일을 지우고 끝낸다.

## 5→6. 테스트 게이트

```bash
npx vitest run supabase/
```

실패하면 push 하지 않는다. 실패 내용을 보여주고 파일을 지운다. 이 테스트들은 마이그레이션 텍스트를
정적으로 검사하므로(예: `processed_webhook_events` 정책 부재) push 뒤가 아니라 **지금** 돌려야 의미가 있다.

## 6. 적용 (질문 2)

```bash
npx supabase db push --dry-run
```

**적용 예정 목록이 5단계에서 만든 파일 하나와 정확히 일치할 때만 진행한다.** 다른 파일이 섞이면
중단한다 — `db push` 는 밀린 파일을 전부 올리므로, 리뷰하지 않은 변경이 함께 production 에 나간다.

일치하면 파일 전문과 dry-run 결과를 보여주고 AskUserQuestion 으로 적용 여부를 묻는다.
- 거절: 만든 파일을 삭제하고 끝낸다(남기면 다음 `git push` 프리플라이트가 막는다).
- 승인: `npx supabase db push --yes` → `npx supabase migration list` 로 원격 적용 여부를 확인한다.
  push 가 실패하면 오류를 보여주고 파일을 지운다(한 파일이라 원격엔 아무것도 적용되지 않았다).

## 7. 검증

`get_advisors` 두 번을 다시 부른다(1단계와 같은 실패 규칙 — 재검사 실패를 "해결됨"으로 쓰지 않는다).
before/after 를 발견 키로 비교해 세 칸으로 보인다:
- **해결** — before 에 있고 after 에 없음
- **잔존** — 둘 다 있음
- **신규** — after 에만 있음. 이번 수정이 만든 객체면 그렇게 표기한다(새 인덱스는 곧바로 `unused_index` 가 뜬다)

Artifact 를 같은 파일 경로로 갱신하고, 마지막에 이렇게 안내한다:
> `<파일 경로>` 를 **main 에 바로 커밋**하세요. 원격이 main 보다 앞선 상태로 두면 다른 브랜치의
> `git push` 가 프리플라이트에 막힙니다.

커밋·PR 은 이 스킬이 하지 않는다.

## 감수한 트레이드오프

- 실행당 파일 1개 — 항목 하나만 되돌리려면 그 섹션의 `before:` 로 새 파일을 써야 한다.
- 쓰기 MCP 차단은 이 문서의 규칙과 MCP 설정(read_only + 플러그인 서버 비활성)뿐이다.
  `settings.json` deny 는 두지 않았다 — 플러그인 Supabase 서버를 다시 켜면 이 규칙만 남는다.
- 명시 호출 전용 — production 에 쓰는 스킬이 "DB 점검해줘"에 의도치 않게 뜨지 않게 했다.
