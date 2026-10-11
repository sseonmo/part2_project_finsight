# Lighthouse 루프 — 후보 지침과 실행 절차

karpathy/autoresearch 의 `program.md` 에 해당한다. 설계는
`docs/superpowers/specs/2026-10-11-lighthouse-loop-design.md`.

## 후보 에이전트 지침

너는 Lighthouse(모바일) Performance 를 올리는 변경 **하나**를 만든다. 측정과 keep/discard
판정은 네가 하지 않는다 — 다른 곳에서 결정론적으로 한다.

**지킬 것**

- 받은 진단(audit) 하나만 겨냥한다. 눈에 띈 다른 개선을 끼워 넣지 않는다. 한 후보에
  두 변경이 섞이면 어느 쪽이 점수를 움직였는지 알 수 없다
- 고칠 수 있는 경로: `src/components/**`, `src/app/**/page.tsx`, `src/app/**/layout.tsx`,
  `src/app/**/loading.tsx`, `src/app/globals.css`, `next.config.ts`, `public/**`
- 그 밖의 경로, 특히 `src/app/api/`·`src/inngest/`·`src/lib/`·`src/services/`·`supabase/`·
  `scripts/`·테스트 파일·`.env*`·`package.json` 을 건드리면 측정 없이 탈락한다
- 화면에 보이는 내용과 동작을 바꾸지 않는다. 점수를 위해 기능을 숨기거나 지우지 않는다
- **최종 화면이 기준과 픽셀 단위로 같아야 keep 된다.** 11개 화면 × 모바일·데스크톱 22장을 찍어 비교하고,
  한 장이라도 다르면 점수와 무관하게 `visual` 로 탈락한다. 글꼴(subset·weight 포함)·레이아웃·색·내용을
  바꾸는 최적화는 안 된다. 폰트는 로딩 방식(`preload`·`font-display`·포맷)만 바꿀 수 있다
- 서버 컴포넌트의 데이터 조회는 `src/lib/` 에 있어 고칠 수 없다. 렌더링 구조
  (클라이언트 경계, `next/dynamic`, `loading.tsx` 스트리밍, 이미지·폰트 로딩)로 접근한다
- 최소 변경. 같은 효과면 줄 수가 적은 쪽

**진단별 출발점**

| 진단 | 먼저 볼 곳 |
|---|---|
| `unused-javascript`, `legacy-javascript-insight` | `"use client"` 경계가 너무 위에 있는지, 무거운 클라이언트 컴포넌트를 `next/dynamic` 으로 미룰 수 있는지 |
| `render-blocking-insight`, `font-display-insight` | `layout.tsx` 의 폰트·CSS 로딩, `next/font` 사용 여부 |
| `lcp-discovery-insight`, `image-delivery-insight` | LCP 요소가 `next/image` 인지, `priority`·`sizes` |
| `cls-culprits-insight` | 크기 미지정 이미지·늦게 끼어드는 배너 |
| `server-response-time`, `document-latency-insight` | `loading.tsx` 로 셸을 먼저 흘려보낼 수 있는지 |

목록에 없는 진단이면 Lighthouse 문서의 audit 설명을 기준으로 판단한다.

**끝낼 때** — 지정 브랜치에 커밋 1개, 한 줄 요약을 반환. 고칠 만한 것이 없으면 커밋하지 않고
그 이유를 반환한다(빈 변경은 그 자체로 정보다).

## 실행 절차 (사람용)

### 최초 1회 — 벤치 준비

메인 체크아웃이 루프 브랜치를 잡고 있으면 벤치가 체크아웃할 수 없다.

```bash
git switch main
git worktree add ~/.cache/finsight-lighthouse/bench perf/lighthouse-loop
cp .env .env.local ~/.cache/finsight-lighthouse/bench/
(cd ~/.cache/finsight-lighthouse/bench && npm ci)
```

벤치를 저장소 밖에 두는 이유: 메인 체크아웃의 Stop 훅이 매 턴 `npm run build` 로 `.next` 를
덮어쓰고, 저장소 안에 두면 ESLint·`tsconfig` 가 벤치 파일까지 훑는다.

`.env` 와 `.env.local` 을 둘 다 복사한다. 둘 다 gitignore 대상이라 worktree 에 따라오지 않고,
`.env` 에만 있는 키(`SUPABASE_STORAGE_BUCKET`·`NEXT_PUBLIC_APP_URL` 등)가 없으면 빌드·렌더가
실패한다. `.env.local` 이 Supabase·Inngest 를 로컬로 덮는다(`up.sh` 와 같은 조합).

### 매 실행

1. `npx supabase start` — 로컬 Supabase. 테스트 유저 데이터가 `pages.json`·`screens.json` 의 URL 을 200 으로
   돌려줘야 한다. 루프 중에는 `scripts/browser-test/reset.sh` 를 돌리지 않는다
1-1. 루프 브랜치 HEAD 의 화면을 미리 본다 — 관문의 기준 이미지가 이 화면이 된다. 기준이 틀리면 그 실행의 판정 전체가 틀어진다:
   `npm run build && node scripts/lighthouse/shots.mjs ref .local/lighthouse/shots/preview` 후
   `.local/lighthouse/shots/preview/` 의 몇 장(`mobile__root.png`, `desktop_dashboard.png`)을 연다.
   같은 커밋이면 루프가 찍는 기준과 픽셀 단위로 같다
2. 포트 3100 이 비어 있는지 확인
3. Claude 에게: `성능 최적화 워크플로 실행해줘` →
   `Workflow({ scriptPath: '<벤치>/.claude/workflows/lighthouse-loop.js', args: { bench: '<벤치>' } })`.
   이름(`name`)이 아니라 벤치의 `scriptPath` 로 부른다 — 이름으로 찾으면 메인 체크아웃의 사본을 쓰는데, 루프 브랜치에서 고친 스크립트가 main 보다 앞서 있을 수 있다.
   실행 회차(run)는 `round.mjs baseline` 이 `results.tsv` 의 마지막 run + 1 로 정해 결과에 돌려준다. 특정 번호를 쓰려면 `args.run` 을 준다(이미 있는 번호는 거부된다)
4. 끝나면 `results.tsv` 와 `git log perf/lighthouse-loop` 를 본다.
   `visual` 줄은 화면이 기준과 달랐다는 뜻이다. 다른 픽셀을 빨갛게 칠한 이미지가
   `.local/lighthouse/shots/run<N>/r<R>-<후보>/diff/` 에, 후보 화면이 같은 디렉터리의 `shots/` 에,
   기준이 `.local/lighthouse/shots/run<N>/ref/` 에 있다. "서울 날짜가 기준선과 다르다" 로 멈췄다면
   자정을 넘긴 것이다 — 다음 번호로 다시 실행한다

**측정 대상은 대표 3개**(`/`, `/dashboard`, `/dashboard/uploads`)다. 11개 전체는 1회 실행이 1시간을 넘어
줄였다. 진단 3개가 셋 모두에 걸리고, 루트·marketing·`(app)` 레이아웃을 모두 지난다. 나머지 페이지의
회귀는 루프가 보지 못하므로 keep 커밋을 PR 로 옮기기 전에 전체 11개를 한 번 단독 실측한다
(`pages.json` 을 아래 동적 URL 까지 채워 `node scripts/lighthouse/measure.mjs`).

동적 URL 을 다시 넣을 때, 또는 `npx supabase db reset`(또는 `scripts/browser-test/reset.sh`)을 했다면 signal·upload id 가 바뀌어 프리플라이트가 404·리다이렉트로 멈춘다. 다시 채운다:
- 신호·리포트 월: 구현 계획 Task 2 Step 6 의 조회로 `screens.json`(과 11개로 되돌린 `pages.json`)의 동적 URL 을 갱신한다. 테스트 유저에게 월간 리포트가 없어도 `/dashboard/report/<ym>` 은 빈 상태로 200 을 준다
- 매핑 페이지: `needs_mapping` 업로드는 정상 흐름에서 남지 않으므로 합성 행을 넣고, 나온 id 로 `screens.json`(과 11개로 되돌린 `pages.json`)의 `/dashboard/uploads/<id>/mapping` 을 바꾼다

```bash
docker exec supabase_db_part2_project_finsight psql -U postgres -d postgres -Atc "
  insert into public.upload_jobs (user_id, storage_key, original_filename, card_label, status, mapping_attempt_count)
  select id, id::text || '/lighthouse-mapping-fixture.csv', 'lighthouse-mapping-fixture.csv', 'lighthouse-fixture', 'needs_mapping', 0
  from auth.users where email = 'e2e-test@finsight.app' returning id;"
```

### 결과 반영

루프 브랜치는 push 하지 않는다. 쓸 만한 커밋을 골라 별도 브랜치로 PR 을 만든다.
후보 브랜치 `perf/cand/*` 는 정리할 때 먼저 후보 worktree 를 `git worktree remove` 로 지운다(이미 디렉터리가 없으면 `git worktree prune`). 커밋이 있는 후보 worktree 는 Claude Code 가 남겨 두고, 체크아웃 중인 브랜치는 `git branch -D` 가 거부되기 때문이다. 그 뒤에 `git branch -D` 로 브랜치를 지운다.
