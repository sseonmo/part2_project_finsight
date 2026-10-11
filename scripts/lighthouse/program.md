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

1. `npx supabase start` — 로컬 Supabase. 테스트 유저 데이터가 `pages.json` 의 URL 을 200 으로
   돌려줘야 한다. 루프 중에는 `scripts/browser-test/reset.sh` 를 돌리지 않는다
2. 포트 3100 이 비어 있는지 확인
3. Claude 에게: `벤치의 lighthouse-loop 워크플로를 run=<N> 으로 실행해줘` →
   `Workflow({ scriptPath: '<벤치>/.claude/workflows/lighthouse-loop.js', args: { run: N, bench: '<벤치>' } })`.
   이름(`name`)으로는 못 찾는다 — 메인 체크아웃은 main 에 있고 이 파일은 루프 브랜치에만 있다.
   N 은 `results.tsv` 의 마지막 run + 1 (같은 번호는 거부된다)
4. 끝나면 `results.tsv` 와 `git log perf/lighthouse-loop` 를 본다

`npx supabase db reset`(또는 `scripts/browser-test/reset.sh`)을 했다면 signal·upload id 가 바뀌어 프리플라이트가 404·리다이렉트로 멈춘다. 다시 채운다:
- 신호·리포트 월: 구현 계획 Task 2 Step 6 의 조회로 `pages.json` 의 동적 URL 을 갱신한다. 테스트 유저에게 월간 리포트가 없어도 `/dashboard/report/<ym>` 은 빈 상태로 200 을 준다
- 매핑 페이지: `needs_mapping` 업로드는 정상 흐름에서 남지 않으므로 합성 행을 넣고, 나온 id 로 `pages.json` 의 `/dashboard/uploads/<id>/mapping` 을 바꾼다

```bash
docker exec supabase_db_part2_project_finsight psql -U postgres -d postgres -Atc "
  insert into public.upload_jobs (user_id, storage_key, original_filename, card_label, status, mapping_attempt_count)
  select id, id::text || '/lighthouse-mapping-fixture.csv', 'lighthouse-mapping-fixture.csv', 'lighthouse-fixture', 'needs_mapping', 0
  from auth.users where email = 'e2e-test@finsight.app' returning id;"
```

### 결과 반영

루프 브랜치는 push 하지 않는다. 쓸 만한 커밋을 골라 별도 브랜치로 PR 을 만든다.
후보 브랜치 `perf/cand/*` 는 정리할 때 `git branch -D` 로 지운다.
