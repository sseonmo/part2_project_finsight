# Lighthouse 자율 최적화 루프 — autoresearch 방식

2026-10-11 · 신규 `scripts/lighthouse/`, `.claude/workflows/lighthouse-loop.js`
2026-10-11 개정 · 스크린샷 관문 추가, `.next/types` 결함 수정

## 왜 만드나

FinSight 의 Lighthouse Performance 점수를 사람이 한 건씩 고치지 않고, 에이전트가 가설 → 수정 → 측정 → keep/discard 를 반복해 끌어올리게 한다. 원형은 karpathy/autoresearch 다. 대응은 이렇다.

| autoresearch | 이 루프 |
|---|---|
| `train.py` (에이전트가 고치는 유일한 파일) | 허용 경로 안의 앱 코드 |
| `prepare.py` (고정된 평가) | `measure.mjs` + `judge.mjs` (에이전트 수정 금지) |
| `val_bpb` (단일 지표) | 대표 3개 페이지 Performance 평균 |
| 개선 시 commit, 아니면 `git reset` | 동일. 브랜치 `perf/lighthouse-loop` |
| `results.tsv` | `scripts/lighthouse/results.tsv` |
| `program.md` | `scripts/lighthouse/program.md` |

원형과 다른 점은 **라운드마다 후보 3개를 병렬로** 만들고 그중 최고만 keep 한다는 것이다.

## 지키는 선

- 측정은 **로컬 Supabase**(`.env.local`)에서만 한다. `.env.local` 이 없으면 프로덕션을 때리므로 즉시 실패한다 (`scripts/browser-test/up.sh` 와 같은 이유)
- 판정은 LLM 이 하지 않는다. 점수 비교·가드레일·종료 조건·다음 가설 선택은 순수 함수(`judge.mjs`)가 하고, 에이전트는 결정론적 스크립트(`round.mjs`)를 실행하고 그 출력을 전달만 한다. 같은 측정 결과면 같은 판정이 나와야 테스트할 수 있다
- push 하지 않는다. 마이그레이션·`.env*`·테스트 파일을 고치지 않는다
- 새 로직은 테스트를 먼저 쓴다 (TDD) — `judge.mjs` 가 대상

## 범위

**측정 대상 — 대표 3개 페이지.** `/`, `/dashboard`, `/dashboard/uploads`. 처음엔 `src/app/**/page.tsx` 11개 전부였으나 1회 실행이 1시간을 넘어 줄였다(2026-10-11). 진단 3개(render-blocking·unused-javascript·legacy-javascript)가 셋 모두에 걸리고 루트·marketing·`(app)` 레이아웃을 모두 지나므로 개선이 나머지 페이지에도 대체로 옮겨간다. 나머지 페이지의 회귀는 루프가 보지 못하므로 PR 전에 11개를 한 번 단독 실측한다. 11개로 되돌릴 때 동적 라우트(`[yearMonth]`, `[signalId]`, `[id]`)는 테스트 유저의 기존 데이터 기준 고정 URL 을 `scripts/lighthouse/pages.json` 에 적는다.

**판정 지표 — Performance 평균 + 가드레일.**
- 지표: 페이지별 Performance 3회 중앙값의 평균 (`perfAvg`)
- keep 조건: 아래를 모두 만족하는 후보 중 `perfAvg` 최고 1개
  - `perfAvg ≥ 현재 최고 + 1` (측정 노이즈로 우연히 오른 점수를 거른다)
  - 어떤 페이지의 Accessibility·Best Practices·SEO 도 기준선보다 낮아지지 않음
  - **스크린샷 관문 통과** — 11개 화면 × 모바일·데스크톱 22장이 기준선과 픽셀 단위로 같음 (아래 "스크린샷 관문")
  - `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` 통과 (`tsc` 를 따로 두는 이유: 허용 경로인 `next.config.ts` 로 `ignoreBuildErrors` 를 켜면 build 의 타입 검사가 꺼진다)
  - 패치가 허용 경로 밖을 건드리지 않음

**측정 조건 — 모바일.** Lighthouse 기본(모바일 에뮬레이션 + 4x CPU·Slow 4G throttling). 데스크톱 preset 은 쓰지 않는다.

**에이전트 수정 허용 경로.**
- 허용: `src/components/**`, `src/app/**/page.tsx`, `src/app/**/layout.tsx`, `src/app/**/loading.tsx`, `src/app/globals.css`, `next.config.ts`, `public/**`
- 금지: `src/app/api/**`, `src/inngest/**`, `src/lib/**`, `src/services/**`, `supabase/**`, `scripts/**`, `*.test.*`, `.env*`, `package.json`, `package-lock.json`

`package.json` 금지는 의존성 추가로 점수를 사는 변경(예: 대형 라이브러리 교체)을 막기 위해서다. 필요하면 사람이 따로 판단한다.

**종료 조건** — 먼저 오는 것.
- `perfAvg ≥ 90`
- 5라운드 연속 keep 없음
- 누적 20라운드

**실행 단위 — 1회 실행 = 기준선 재측정 + 2라운드.** 실행당 에이전트 9개(기준선 측정 1 + 라운드마다 후보 3·측정 1 × 2). 세션의 workflow 크기 가이드(10개 미만) 안에 들어가고, 실행 사이에 사람이 결과를 보고 다음 실행을 결정한다. 실행 간 상태는 브랜치와 `results.tsv` 에 있으므로 Workflow 의 `resumeFromRunId` 는 쓰지 않는다 — 그냥 다시 실행한다.

## 구조

```
[기준선] 측정 에이전트 → round.mjs baseline: 현재 최고 커밋 build → 기준 이미지 22장 촬영(2회 일치) → 측정
                                              → perfAvg·가드레일 기준값·opportunities·refDir
   │
   ▼  judge.pickHypotheses(): 절감 ms 상위 audit 3개를 후보에 배정
[라운드 n]
  ├─ 후보 A (worktree) ─┐
  ├─ 후보 B (worktree) ─┼─ program.md 지침대로 한 가설만 수정 → perf/cand/run{N}-r{n}-{x} 브랜치에 커밋
  └─ 후보 C (worktree) ─┘
   │  barrier — 세 결과를 비교해야 하므로
   ▼
  측정 에이전트 → round.mjs evaluate (벤치 worktree, 직렬, 백그라운드 + wait 폴링):
     후보마다: 경로 검사 → 체크아웃 → lint → build → tsc → vitest
               → withServer{ 촬영·비교(차이면 visual, Lighthouse 생략) → Lighthouse } → 루프 브랜치 복귀
     → judge.decide() 의 승자만 ff-merge
     → results.tsv 에 후보 줄 기록 후 커밋
   │
   ▼  judge.shouldStop() 확인 → 계속이면 다음 라운드
```

**실행마다 기준선을 재측정한다.** 실행 사이에 머신 부하·온도가 달라지면 절대 점수가 흔들린다. 같은 실행 안에서 비교해야 +1 문턱이 의미를 가진다.

**측정은 저장소 밖 벤치 worktree(`~/.cache/finsight-lighthouse/bench`)에서 한다.** 메인 체크아웃에서 측정하면 `.claude/settings.json` 의 Stop 훅이 매 턴 `npm run build` 로 같은 `.next` 를 덮어써 측정 중인 `next start` 가 깨지고, 루프가 도는 몇 시간 동안 메인 체크아웃을 쓸 수 없다. 저장소 안(`.local/`)에 두면 ESLint·`tsconfig` 가 벤치 파일까지 훑는다. 벤치는 루프 브랜치를 체크아웃하고, `.env`·`.env.local` 을 복사하고 `npm ci` 로 준비한다(`.env.local` 이 Supabase·Inngest 를 로컬로 덮는, `up.sh` 와 같은 조합).

**후보는 브랜치로 넘긴다.** worktree 들은 같은 저장소의 ref 를 공유하므로 벤치에서 바로 체크아웃할 수 있다. 후보 worktree 에는 `node_modules` 가 없어 빌드·측정은 하지 않는다.

**라운드 절차는 `round.mjs` 가 한다.** 후보 3개 × (체크아웃·검사·측정·복귀)를 LLM 이 손으로 하면 순서 실수가 이력을 오염시킨다. 측정 에이전트는 실행과 결과 전달만 한다. Bash 단일 호출 상한(10분)보다 라운드가 길므로 `nohup` 으로 띄우고 `round.mjs wait` 로 최대 9분씩 기다린다.

## 스크린샷 관문

점수를 올리려다 화면이 바뀌면 그것은 개선이 아니라 버그다. 루프의 계약은 "최종 화면은 그대로, 더 빨리" 이므로 화면 변화는 **결정론적으로** 탈락시킨다. 계기: 2026-10-11 run 1 의 keep(`preload: false`)이 화면을 0px 바꾼 이유를 추적하다, Pretendard 가 2026-08-17 부터 한 번도 적용되지 않던 버그를 발견했다(`47b0f58` 에서 수정). 점수 99 는 글꼴이 빠진 화면의 점수였다 — 루프는 화면을 보지 않았기 때문에 이런 일을 알아챌 수 없었다.

- **판정은 엄격하다.** 22장 중 한 장이라도 기준과 다르면(재촬영 후에도) `visual` 로 탈락. 허용치를 두지 않는다 — 같은 커밋 두 번 촬영이 22장 전부 0px 이었으므로 잡음 허용이 필요 없고, 허용치는 폰트 subset 축소로 글자 몇 개가 빠지는 회귀를 통과시킨다
- **대상**: `scripts/lighthouse/screens.json` 의 11개 화면 × 모바일(390×844, isMobile) · 데스크톱(1440×900). 측정 대상 3개보다 넓다 — 촬영은 가벼우므로 측정에서 뺀 8개 화면의 회귀를 여기서 잡는다
- **기준 이미지는 실행마다 기준선 커밋에서 새로 찍는다** (`.local/lighthouse/shots/run{N}/ref/`). 저장소에 golden 이미지를 커밋하지 않는다 — Chrome·머신이 바뀌면 전부 깨지고, 점수 기준선도 같은 이유로 실행마다 재측정한다. 판정이 엄격하므로 keep 된 후보의 화면은 기준과 같고, 한 실행 안에서 기준은 바뀌지 않는다
- **촬영 조건**: DPR 1, `networkidle0`, 애니메이션·transition·caret 끄는 style 주입, `document.fonts.ready`, +500ms, fullPage
- **비교**: RGB 채널 차이 > 16 인 픽셀이 1개라도 있으면 다름. 크기(특히 높이)가 다르면 픽셀 비교 없이 다름
- **불안정 촬영 대응**: CSS 가 빠진 채 찍힌 1회(99.8% diff)가 관측됐다
  - 후보: 다른 화면만 최대 2회 재촬영, 세 번 모두 다를 때만 `visual`
  - 기준: 22장을 두 번 찍어 **서로 같아야** 채택. 다른 화면만 다시 찍어 직전 촬영과 일치하면 채택, 3회 안에 안 되면 환경 오류(exit 1). 기준이 틀리면 모든 후보가 억울하게 탈락하기 때문이다
- **날짜가 바뀌면 멈춘다.** 대시보드 일자·체험 잔여일·설정의 남은 일수는 서버(`next start`)가 서울 날짜로 계산하므로 puppeteer 로 브라우저 시계를 고정해도 소용없다. 기준선의 서울 날짜를 `best.json` 의 `refDate` 에 두고, 후보를 찍기 직전 날짜가 다르면 환경 오류로 멈춘다 — 후보 실패로 기록하면 `pickHypotheses` 의 실패 횟수가 쌓여 멀쩡한 진단이 영영 제외된다
- **Lighthouse 보다 먼저 찍는다.** `visual` 이면 10분 넘는 측정을 건너뛴다
- diff 이미지(다른 픽셀 빨강)는 `.local/lighthouse/shots/run{N}/r{R}-{id}/diff/` 에 남겨 사람이 본다

## 구성 요소

### `scripts/lighthouse/measure.mjs` — 측정 (에이전트 수정 금지)

`preflight(cwd)` · `build(cwd)` · `withServer(cwd, fn)` · `lighthouse({ baseUrl, cookies })` 로 나눈다. `withServer` 는 `next start`·쿠키 발급·프리플라이트를 하고 `fn({ baseUrl, cookies })` 를 부른 뒤 서버를 끈다 — 서버 한 번으로 촬영과 측정을 함께 하기 위해서다. 서버 종료는 프로세스 그룹 kill 이다(`pkill -f "next start"` 는 Next 15 가 프로세스 이름을 `next-server` 로 바꿔 안 잡힌다). CLI 단독 실행(`node measure.mjs`)은 아래 순서 그대로 동작한다.

1. 전제 확인: `.env.local` 존재, `http://127.0.0.1:54321` 응답, 포트 3100 비어 있음. 아니면 exit 1
2. `npm run build` (실패 시 exit 2 — 후보 crash) → `next start -p 3100`
3. `scripts/browser-test/make-cookie.mjs` 로 세션 쿠키 발급
4. `pages.json` 의 각 URL 이 리다이렉트 없이 200 인지 확인. 아니면 exit 1 (쿠키 만료·데이터 없음을 점수 하락으로 오인하지 않기 위해). 단 HTTP 5xx 는 후보가 페이지를 깨뜨린 build/런타임 실패로 보고 exit 2 (→ crash), 리다이렉트·401·404 는 환경 오류로 남는다. `/` 는 쿠키 없이 — 로그인 사용자는 `/dashboard` 로 리다이렉트된다
5. URL × 3회 Lighthouse (Node API + `chrome-launcher`, 쿠키는 `extraHeaders` 로 주입 — 페이지 로드에는 브라우저 Supabase 클라이언트가 쓰이지 않는다)
6. 페이지별 카테고리 점수 중앙값 + opportunities(auditId, 예상 절감 ms, 해당 페이지) 집계. runtimeError·null 점수는 0점이 아니라 exit 1
7. 서버 종료, stdout 으로 JSON 출력

```json
{ "perfAvg": 62.4,
  "perPage": [{ "path": "/", "perf": 71, "a11y": 95, "bp": 100, "seo": 92 }],
  "opportunities": [{ "auditId": "unused-javascript", "savingsMs": 1350, "pages": ["/dashboard"] }] }
```

devDependencies 에 `lighthouse`, `chrome-launcher` 를 추가한다.

### `scripts/lighthouse/shots.mjs` — 촬영·비교 (에이전트 수정 금지)

- 순수(TDD): `shotName(viewport, path)`, `comparePixels(a, b)` → `{ count, mask }`, `listScreens(screens)`, `navErrorCode(status, redirected)`, `judgeShots(results)` → `{ ok, diffs: ['mobile /dashboard 1.20%', 'desktop / 크기 1440x3843→1440x3894'] }`, `pickRetakes(results)`(다른 화면만)
- 본체: `capture(server, outDir, only?)`, `compare(refDir, dir, diffDir)`, `captureRef(server, refDir)`(기준 채택 규칙), `captureCandidate(server, refDir, dir)`(재촬영 포함). `server` 는 `withServer` 가 넘기는 `{ baseUrl, cookies }`
- CLI: `node scripts/lighthouse/shots.mjs ref <refDir>` · `check <refDir> <dir>` — build 된 체크아웃에서 관문만 따로 돌린다(사람의 기준 이미지 확인용)
- 의존성 `puppeteer-core`·`sharp` 는 지금 lighthouse·next 의 전이 의존성으로만 있다. 호이스팅이 바뀌면 사라지므로 devDependencies 에 설치된 버전 그대로(`25.13.0`·`0.35.4`) 명시한다. Chrome 은 `chrome-launcher` 가 찾는 경로를 쓴다
- 촬영 중 5xx 는 후보 `crash`, 리다이렉트·401·404·Chrome 실행 실패·이동 예외(서버 다운·연결 거부·타임아웃)는 환경 오류(exit 1) — 이동 예외는 후보 탓이라 단정할 수 없고, crash 로 세면 `pickHypotheses` 가 실패로 쳐 멀쩡한 진단이 빠진다(`measure.mjs` 가 Lighthouse runtimeError 를 1 로 보는 것과 같은 이유)
- 날짜는 촬영 직전에 보고, 관문이 다르다고 하면 한 번 더 본다 — 22장과 재촬영 사이에 자정을 넘길 수 있다

### `scripts/lighthouse/screens.json` — 촬영 대상

11개 경로와 auth 여부. 동적 라우트는 테스트 유저의 기존 데이터 기준 고정 URL(`/dashboard/report/2026-07`, `/dashboard/review/2026-07`, 그 신호 상세, 매핑 fixture `33dad667-…`). `pages.json`(측정 대상)과 분리한다.

### `scripts/lighthouse/judge.mjs` — 판정 (순수 함수, TDD)

- `checkPaths(paths)` → `{ ok, violations }`
- `decide(best, candidates)` → `{ winner | null, results: [{status: keep|discard|outcompeted|crash|scope|visual, perfAvg, reason}] }`. `visual` 은 crash·scope 처럼 측정값 없이 탈락하고 `outcompeted` 로 바뀌지 않는다
- `pickHypotheses(opportunities, history, n=3)` → 절감 ms 내림차순. 실패(discard·crash·scope·visual) 2회 audit 만 제외한다(기준을 넘고도 라운드 승자에게 밀린 `outcompeted` 는 실패로 세지 않는다). **keep 된 audit 도 다시 고를 수 있다** — 가장 큰 진단은 한 번의 최소 변경으로 다 해소되지 않는 경우가 많다
- `shouldStop(bestPerf, history)` → `{ stop, reason }`

### `scripts/lighthouse/round.mjs` — 라운드 절차 CLI

`baseline --run N` / `evaluate --run N --round R --candidates <encoded>` / `wait`. 결과는 `--out` 파일에 원자적으로 쓴다. `best.json` 에 `refDir`·`refDate` 를 넣고, `evaluate` 는 둘 중 하나라도 없으면 중단한다 — 기준 없이 비교를 건너뛰는 경로를 두지 않는다.

**검사 순서는 lint → build → tsc → vitest.** tsconfig 가 `.next/types` 를 포함하므로 tsc 는 build 가 만든 현재 후보의 타입을 봐야 한다. 처음엔 build 전에 tsc 를 돌리며 `.next/types` 를 지웠는데, 코드가 직전과 같으면 webpack 캐시가 타입 파일을 다시 만들지 않아 멀쩡한 후보가 `.next/types/... not found` 로 crash 할 수 있었다. 이미 이력에 있는 run 번호는 거부한다 — 같은 번호면 후보 브랜치 이름이 겹쳐 라운드 전체가 scope 로 탈락한다.

### `scripts/lighthouse/program.md` — 후보 지침과 실행 절차

- 받은 audit 하나만 겨냥한다. 다른 개선을 끼워 넣지 않는다
- 허용 경로 안에서 최소 변경. 기능·화면 동작을 바꾸지 않는다
- **최종 화면은 기준과 픽셀 단위로 같아야 keep 된다.** 글꼴·레이아웃·색·내용을 바꾸는 최적화는 `visual` 로 탈락한다
- 지정 브랜치에 커밋 1개, 한 줄 요약 반환
- 벤치 준비·매 실행 절차·`db reset` 후 `pages.json`·`screens.json` 갱신
- 첫 라운드 전에 사람이 기준 이미지 몇 장을 눈으로 확인한다 — 기준이 틀리면 그 실행의 판정 전체가 틀어진다

### `scripts/lighthouse/results.tsv` — 이력 (커밋 대상)

`run · round · candidate · auditId · perfAvg · minGuard · status · commit · description`. 열은 바꾸지 않는다 — `visual` 은 status 값 하나로 추가되고 차이 요약은 description 의 reason 에 들어간다

### `.claude/workflows/lighthouse-loop.js` — 오케스트레이션

스크립트는 셸·파일 접근이 없으므로 측정과 이력 읽기는 측정 에이전트가 `round.mjs` 로 하고, 스크립트는 그 결과 JSON 으로만 분기한다. `args`: `{ run, bench, rounds: 2 }`. 메인 체크아웃은 main 에 있고 이 파일은 루프 브랜치에만 있으므로 **이름이 아니라 벤치의 `scriptPath` 로 호출한다.**

## 안전장치

- `round.mjs` 는 시작 시 브랜치가 `perf/lighthouse-loop` 이고 `git status` 가 깨끗한지 확인한다. 아니면 중단
- 후보는 detached 체크아웃으로 측정하고 끝나면 항상(`finally`) 루프 브랜치로 돌아간다 — 한 후보의 잔여물이 다음 후보에 섞이지 않게
- 빌드·타입·테스트 실패는 `crash` 로 기록하고 다음 후보로 넘어간다. 루프 전체를 멈추지 않는다
- 기준 이미지가 3회 안에 일치하지 않으면 루프를 멈춘다(환경 오류)
- `measure.mjs` 전제 확인 실패(Supabase 꺼짐, 쿠키 만료, 리다이렉트)는 루프를 멈춘다. 환경 문제를 후보 실패로 기록하면 이력이 오염된다

## 테스트

- `judge.mjs`: `node --test` — 문턱 경계(+0.9 / +1.0), 가드레일 하락 1점, 금지 경로, 전 후보 crash, 종료 조건 세 가지, 가설 선택의 재시도 규칙
- `shots.mjs`: `node --test` — `comparePixels` 동일·문턱 경계(차이 16 은 같음, 17 은 다름), `judgeShots` 크기 차이·후보 이미지 없음·일부 화면만 다름·전부 같음, `pickRetakes`, `navErrorCode`
- `judge.mjs` 추가: `visual` 은 keep 되지 않고 `outcompeted` 로 바뀌지 않음, `visual` 2회 audit 제외
- `measure.mjs`·`round.mjs`: 순수 헬퍼만 `node --test`. 프로세스·git 을 엮는 본체는 기준선 실측과 1회 실행으로 확인한다
- 워크플로: vitest — 전역 스텁으로 실행 (`review-code.test.js` 와 같은 방식)
- 관문 실측: (1) 글꼴을 시스템 폰트로 되돌리는 가짜 후보가 `visual` 로 탈락 (2) 화면을 바꾸지 않는 변경(주석)이 관문을 통과
- 루프 전체: 1회 실행(기준선 + 2라운드)을 돌려 `results.tsv` 와 브랜치 커밋이 기대대로 남는지 본다

## 감수한 트레이드오프

- **의도한 화면 개선도 탈락한다.** 관문은 "바뀌었는가" 만 보고 "나아졌는가" 는 보지 않는다. 화면을 바꾸는 변경은 루프 밖에서 사람이 한다
- 테스트 유저 데이터를 시드로 고정하지 않는다. 데이터가 바뀌어도 기준을 실행마다 다시 찍으므로 실행 안에서는 같다
- 촬영은 로그인 상태의 정적 첫 화면만 본다. 클릭·스크롤 후 상태(모달, 드롭다운)의 회귀는 vitest 와 PR 리뷰에 맡긴다
- keep 된 audit 을 다시 고르므로 같은 진단이 매 라운드 후보 한 자리를 차지할 수 있다

## 하지 않는 것

- 시드 데이터 자동 생성 — 테스트 유저의 기존 로컬 데이터를 쓴다. 데이터가 바뀌면 점수가 흔들리므로 루프 중에는 `reset.sh` 를 돌리지 않는다
- 프로덕션·Vercel preview 측정
- 결과의 `main` 병합 — 사람이 브랜치를 보고 PR 로 결정한다
