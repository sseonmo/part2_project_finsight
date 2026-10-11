# Lighthouse 자율 최적화 루프 — autoresearch 방식

2026-10-11 · 신규 `scripts/lighthouse/`, `.claude/workflows/lighthouse-loop.js`

## 왜 만드나

FinSight 의 Lighthouse Performance 점수를 사람이 한 건씩 고치지 않고, 에이전트가 가설 → 수정 → 측정 → keep/discard 를 반복해 끌어올리게 한다. 원형은 karpathy/autoresearch 다. 대응은 이렇다.

| autoresearch | 이 루프 |
|---|---|
| `train.py` (에이전트가 고치는 유일한 파일) | 허용 경로 안의 앱 코드 |
| `prepare.py` (고정된 평가) | `measure.mjs` + `judge.mjs` (에이전트 수정 금지) |
| `val_bpb` (단일 지표) | 11개 페이지 Performance 평균 |
| 개선 시 commit, 아니면 `git reset` | 동일. 브랜치 `perf/lighthouse-loop` |
| `results.tsv` | `scripts/lighthouse/results.tsv` |
| `program.md` | `scripts/lighthouse/program.md` |

원형과 다른 점은 **라운드마다 후보 3개를 병렬로** 만들고 그중 최고만 keep 한다는 것이다.

## 지키는 선

- 측정은 **로컬 Supabase**(`.env.local`)에서만 한다. `.env.local` 이 없으면 프로덕션을 때리므로 즉시 실패한다 (`scripts/browser-test/up.sh` 와 같은 이유)
- 판정은 LLM 이 하지 않는다. 점수 비교·가드레일·종료 조건·다음 가설 선택은 순수 함수(`judge.mjs`)가 하고, 에이전트는 그 출력대로 commit/reset 만 한다. 같은 측정 결과면 같은 판정이 나와야 테스트할 수 있다
- push 하지 않는다. 마이그레이션·`.env*`·테스트 파일을 고치지 않는다
- 새 로직은 테스트를 먼저 쓴다 (TDD) — `judge.mjs` 가 대상

## 범위

**측정 대상 — 11개 페이지 전체.** `src/app/**/page.tsx` 전부. 동적 라우트(`[yearMonth]`, `[signalId]`, `[id]`)는 테스트 유저의 기존 데이터 기준 고정 URL 을 `scripts/lighthouse/pages.json` 에 적는다.

**판정 지표 — Performance 평균 + 가드레일.**
- 지표: 페이지별 Performance 3회 중앙값의 11개 평균 (`perfAvg`)
- keep 조건: 아래를 모두 만족하는 후보 중 `perfAvg` 최고 1개
  - `perfAvg ≥ 현재 최고 + 1` (측정 노이즈로 우연히 오른 점수를 거른다)
  - 어떤 페이지의 Accessibility·Best Practices·SEO 도 기준선보다 낮아지지 않음
  - `npm run lint`, `npx vitest run`, `npm run build` 통과
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
[기준선] 측정 에이전트: 현재 HEAD 측정 → perfAvg·가드레일 기준값·opportunities
   │
   ▼  judge.pickHypotheses(): 시도 이력에 없는 audit 상위 3개를 후보에 배정
[라운드 n]
  ├─ 후보 A (worktree) ─┐
  ├─ 후보 B (worktree) ─┼─ program.md 지침대로 한 가설만 수정 → git diff 를 패치로 반환
  └─ 후보 C (worktree) ─┘
   │  barrier — 세 결과를 비교해야 하므로
   ▼
  측정 에이전트 (메인 체크아웃, 직렬):
     후보마다: 경로 검사 → 패치 적용 → lint·vitest·build → measure.mjs → git reset --hard
     → judge.decide() 결과대로 승자 패치만 다시 적용해 commit
     → results.tsv 에 후보 3줄 + 결정 기록
   │
   ▼  judge.shouldStop() 확인 → 계속이면 다음 라운드
```

**실행마다 기준선을 재측정한다.** 실행 사이에 머신 부하·온도가 달라지면 절대 점수가 흔들린다. 같은 실행 안에서 비교해야 +1 문턱이 의미를 가진다.

**후보 패치는 worktree 에서 만들고 측정은 메인 체크아웃에서 한다.** worktree 에는 `node_modules`·`.env.local` 이 없어 빌드·측정이 불가능하고, Lighthouse 는 CPU 를 다투면 점수가 흔들리므로 측정은 어차피 직렬이어야 한다.

## 구성 요소

### `scripts/lighthouse/measure.mjs` — 측정 (에이전트 수정 금지)

1. 전제 확인: `.env.local` 존재, `http://127.0.0.1:54321` 응답. 아니면 exit 1
2. `npm run build` → `next start -p 3100` (dev 서버 3000 과 겹치지 않게)
3. `scripts/browser-test/make-cookie.mjs` 로 세션 쿠키 발급
4. `pages.json` 의 각 URL 이 리다이렉트 없이 200 인지 확인. 아니면 exit 1 (쿠키 만료·데이터 없음을 점수 하락으로 오인하지 않기 위해)
5. URL × 3회 Lighthouse (Node API + `chrome-launcher`, 쿠키는 `extraHeaders` 로 주입)
6. 페이지별 카테고리 점수 중앙값 + opportunities(auditId, 예상 절감 ms, 해당 페이지) 집계
7. 서버 종료, stdout 으로 JSON 출력

```json
{ "perfAvg": 62.4,
  "perPage": [{ "url": "/", "perf": 71, "a11y": 95, "bp": 100, "seo": 92 }],
  "opportunities": [{ "auditId": "unused-javascript", "savingsMs": 1350, "pages": ["/dashboard"] }] }
```

devDependencies 에 `lighthouse`, `chrome-launcher` 를 추가한다.

### `scripts/lighthouse/judge.mjs` — 판정 (순수 함수, TDD)

- `isPathAllowed(paths)` → 금지 경로 목록
- `decide(baseline, best, candidates)` → `{ winner | null, perCandidate: [{status: keep|discard|crash|scope, reason}] }`
- `pickHypotheses(opportunities, history, n=3)` → 절감 ms 내림차순, 이력에 keep 된 audit 제외, discard 는 1회까지만 재시도
- `shouldStop(history)` → `{ stop, reason }`

측정 에이전트는 `node scripts/lighthouse/judge.mjs <cmd> <json>` CLI 로 호출하고 출력 그대로 따른다.

### `scripts/lighthouse/program.md` — 후보 에이전트 지침

- 받은 audit 하나만 겨냥한다. 다른 개선을 끼워 넣지 않는다
- 허용 경로 안에서 최소 변경. 기능·화면 동작을 바꾸지 않는다
- 끝나면 `git diff` 를 그대로 반환하고, 변경 의도를 한 줄로 요약한다

### `scripts/lighthouse/results.tsv` — 이력 (커밋 대상)

`run · round · candidate · auditId · perfAvg · minGuard · status · commit · description`

### `.claude/workflows/lighthouse-loop.js` — 오케스트레이션

이름으로 재실행할 수 있게 저장한다. 스크립트는 셸·파일 접근이 없으므로 측정과 이력 읽기는 측정 에이전트가 하고, 스크립트는 그 결과 JSON 으로만 분기한다. `args`: `{ run: <실행 번호>, rounds: 2 }`.

## 안전장치

- 측정 에이전트는 시작 시 브랜치가 `perf/lighthouse-loop` 이고 `git status` 가 깨끗한지 확인한다. 아니면 중단
- 후보 처리 사이 항상 `git reset --hard <현재 최고 commit>` — 한 후보의 잔여물이 다음 후보 측정에 섞이지 않게
- 빌드·테스트 실패는 `crash` 로 기록하고 다음 후보로 넘어간다. 루프 전체를 멈추지 않는다
- `measure.mjs` 전제 확인 실패(Supabase 꺼짐, 쿠키 만료)는 루프를 멈춘다. 환경 문제를 후보 실패로 기록하면 이력이 오염된다

## 테스트

- `judge.mjs`: vitest — 문턱 경계(+0.9 / +1.0), 가드레일 하락 1점, 금지 경로 1개 포함, 전 후보 crash, 종료 조건 세 가지, 가설 선택의 재시도 규칙
- `measure.mjs`: 단위 테스트 대신 기준선 1회 실측으로 확인한다 (외부 프로세스 오케스트레이션이라 모킹 가치가 낮다)
- 루프 전체: 1회 실행(기준선 + 2라운드)을 돌려 `results.tsv` 와 브랜치 커밋이 기대대로 남는지 본다

## 하지 않는 것

- 시드 데이터 자동 생성 — 테스트 유저의 기존 로컬 데이터를 쓴다. 데이터가 바뀌면 점수가 흔들리므로 루프 중에는 `reset.sh` 를 돌리지 않는다
- 프로덕션·Vercel preview 측정
- 결과의 `main` 병합 — 사람이 브랜치를 보고 PR 로 결정한다
