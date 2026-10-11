# Lighthouse 자율 최적화 루프 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 라운드마다 후보 3개를 병렬로 만들고 Lighthouse(모바일)로 직렬 측정해 최고 후보만 keep 하는 autoresearch 방식 루프를 만든다.

**Architecture:** 판정은 순수 함수(`judge.mjs`), 측정은 `measure.mjs`, 한 라운드의 git·측정·기록 절차는 `round.mjs` 가 결정론적으로 수행한다. Workflow 스크립트(`lighthouse-loop.js`)는 후보 에이전트를 worktree 에서 병렬로 띄우고, 측정 에이전트에게 `round.mjs` 실행만 맡긴다. 측정은 메인 체크아웃이 아니라 별도 **벤치 worktree**(`~/.cache/finsight-lighthouse/bench`)에서 한다.

**Tech Stack:** Node ESM(`.mjs`), `node:test`, `lighthouse@13.5.0`, `chrome-launcher@1.2.2`, vitest(Workflow 스크립트 테스트), Claude Workflow.

**Spec:** `docs/superpowers/specs/2026-10-11-lighthouse-loop-design.md`

## Global Constraints

- 측정은 로컬 Supabase(`.env.local`)에서만. `.env.local` 없거나 `http://127.0.0.1:54321` 무응답이면 exit 1
- Lighthouse 는 기본 설정(모바일 에뮬레이션 + 4x CPU·Slow 4G throttling). `--preset=desktop` 금지
- 페이지별 3회 중앙값, 11개 페이지 Performance 평균 = `perfAvg`
- keep: `perfAvg ≥ 현재 최고 + 1`, 모든 페이지 a11y·bp·seo 가 현재 최고 측정값 이상, lint·tsc·vitest·build 통과, 허용 경로만 변경 — 이 조건을 만족하는 후보 중 최고 1개
- 종료: `perfAvg ≥ 90` / 5라운드 연속 keep 없음 / 누적 20라운드 — 먼저 오는 것
- 1회 실행 = 기준선 + 2라운드 = 에이전트 9개
- 허용 경로: `src/components/**`, `src/app/**/page.tsx`, `src/app/**/layout.tsx`, `src/app/**/loading.tsx`, `src/app/globals.css`, `next.config.ts`, `public/**`
- 금지 경로(허용보다 우선): `src/app/api/**`, `src/inngest/**`, `src/lib/**`, `src/services/**`, `supabase/**`, `scripts/**`, `*.test.*`, `.env*`, `package.json`, `package-lock.json`
- 판정은 LLM 이 하지 않는다. push 하지 않는다
- `scripts/**` 는 ESLint 대상이 아니다(`eslint.config.mjs` ignores). `scripts/lighthouse/*.test.mjs` 는 `node --test` 로 돌린다 (`scripts/hooks/` 와 같은 관례)

## 스펙과 달라지는 점 (승인됨, spec 에 반영)

1. **측정 위치: 메인 체크아웃 → 별도 벤치 worktree.** 메인 체크아웃에서 측정하면 (a) `.claude/settings.json` 의 Stop 훅이 매 턴 `npm run build` 로 같은 `.next` 를 덮어써 측정 중인 `next start` 가 깨지고, (b) 루프가 도는 몇 시간 동안 메인 체크아웃을 쓸 수 없다. 벤치는 저장소 **밖**(`~/.cache/finsight-lighthouse/bench`)에 둔다. 저장소 안(`.local/`)에 두면 ESLint(`.` 전체)와 `tsconfig` include 가 벤치 파일까지 훑는다
2. **라운드 절차를 `round.mjs` 로 스크립트화.** 스펙은 측정 에이전트가 단계를 하나씩 수행한다고 했지만, 후보 3개 × (체크아웃·lint·test·build·측정·복귀)를 LLM 이 손으로 하면 순서 실수가 이력을 오염시킨다. 에이전트는 `round.mjs` 실행과 결과 전달만 한다
3. **후보는 패치 대신 브랜치를 반환.** worktree 들은 같은 저장소의 ref 를 공유하므로, 후보가 `perf/cand/...` 브랜치에 커밋하면 벤치에서 바로 체크아웃할 수 있다. 큰 diff 를 프롬프트로 옮기는 과정이 사라진다
4. **측정은 백그라운드 + 폴링.** Bash 도구의 단일 호출 상한이 10분인데, 후보 3개 평가는 30분 이상 걸린다. `round.mjs` 를 `nohup` 으로 띄우고 `round.mjs wait` 로 최대 9분씩 기다린다

## Review Focus

1. **쿠키 만료·데이터 부재로 대시보드가 `/` 로 리다이렉트되는 경우** — 점수 하락이 아니라 환경 오류로 exit 1 해야 한다. → Task 2 `preflightStatus` 테스트
2. **Lighthouse 실행이 runtimeError 로 카테고리 점수가 `null` 인 경우** — 0점으로 집계하면 후보가 억울하게 discard 된다. 환경 오류로 멈춘다. → Task 2 `summarizeLhr` 테스트
3. **후보 에이전트가 브랜치를 안 만들었거나 다른 커밋에서 갈라진 경우** — 측정하지 않고 crash/scope 로 기록. → Task 3 `classifyCandidate` 테스트
4. **후보 설명에 탭·개행이 들어간 경우** — `results.tsv` 줄이 깨지면 이력 파싱이 틀어져 종료 조건이 오작동한다. → Task 1 `formatRow` 테스트
5. **Lighthouse 진단이 3개 미만인 경우** — 후보 수를 줄이고, 0개면 루프를 멈춘다. → Task 1 `pickHypotheses`, Task 4 워크플로 테스트

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `scripts/lighthouse/judge.mjs` | 순수 함수: 경로 검사, 가드레일, 결정, 가설 선택, 종료 조건, TSV 입출력 |
| `scripts/lighthouse/judge.test.mjs` | `node --test` |
| `scripts/lighthouse/measure.mjs` | 빌드 → 서버 → 쿠키 → 프리플라이트 → Lighthouse → 집계. 순수 헬퍼는 export |
| `scripts/lighthouse/measure.test.mjs` | 순수 헬퍼 테스트 |
| `scripts/lighthouse/round.mjs` | CLI `baseline` / `evaluate` / `wait`. git·measure·judge·TSV 를 엮는다 |
| `scripts/lighthouse/round.test.mjs` | `classifyCandidate`·`decodeCandidates` 테스트 |
| `scripts/lighthouse/pages.json` | 측정 대상 11개 URL |
| `scripts/lighthouse/results.tsv` | 이력 (헤더만으로 시작) |
| `scripts/lighthouse/program.md` | 후보 에이전트 지침 + 벤치 준비·실행 방법 |
| `.claude/workflows/lighthouse-loop.js` | 오케스트레이션 |
| `.claude/workflows/lighthouse-loop.test.js` | 전역 스텁으로 실행하는 vitest |
| `package.json` | devDependencies 에 `lighthouse`, `chrome-launcher` |

---

### Task 1: `judge.mjs` — 판정 순수 함수

**Files:**
- Create: `scripts/lighthouse/judge.mjs`
- Test: `scripts/lighthouse/judge.test.mjs`

**Interfaces:**
- Produces:
  - `THRESHOLDS = { MIN_GAIN: 1, TARGET: 90, STALL_ROUNDS: 5, MAX_ROUNDS: 20, CANDIDATES: 3 }`
  - `checkPaths(paths: string[]) → { ok: boolean, violations: string[] }`
  - `guardDrops(best: Measurement, m: Measurement) → string[]`
  - `decide(best: {commit, measurement: Measurement}, candidates: Candidate[]) → { winner: string|null, results: Result[] }`
    - `Candidate = { id, auditId, branch, description, status: 'measured'|'crash'|'scope'|'nochange', reason?, measurement? }`
    - `Result = { id, auditId, branch, description, status: 'keep'|'discard'|'crash'|'scope', perfAvg: number|null, reason: string }`
  - `pickHypotheses(opportunities, history, n = THRESHOLDS.CANDIDATES) → Opportunity[]`
  - `shouldStop(bestPerf: number, history: Row[]) → { stop: boolean, reason: string }`
  - `TSV_HEADER: string`, `parseHistory(text) → Row[]`, `formatRow(row) → string`
    - `Row = { run: number, round: number, candidate, auditId, perfAvg: number|null, minGuard: number|null, status, commit, description }`
  - `Measurement = { perfAvg: number, perPage: [{ path, perf, a11y, bp, seo }], opportunities: [{ auditId, savingsMs, pages: string[] }] }`

- [ ] **Step 1: Write the failing test**

`scripts/lighthouse/judge.test.mjs`:

```js
// judge 테스트 — node --test scripts/lighthouse/
//
// 루프의 판정은 전부 여기 있다. 같은 측정 결과면 같은 판정이 나와야 한다.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  THRESHOLDS,
  checkPaths,
  guardDrops,
  decide,
  pickHypotheses,
  shouldStop,
  TSV_HEADER,
  parseHistory,
  formatRow,
} from './judge.mjs'

const page = (path, perf, extra = {}) => ({ path, perf, a11y: 95, bp: 100, seo: 92, ...extra })
const m = (perfAvg, pages = [page('/', perfAvg)], opportunities = []) => ({ perfAvg, perPage: pages, opportunities })
const best = { commit: 'b0', measurement: m(60) }
const cand = (id, measurement, extra = {}) => ({
  id, auditId: 'audit-' + id, branch: 'perf/cand/' + id, description: id + ' 설명', status: 'measured', measurement, ...extra,
})

describe('checkPaths', () => {
  test('허용 경로만 있으면 통과한다', () => {
    assert.deepEqual(
      checkPaths(['src/components/Foo.tsx', 'src/app/(app)/dashboard/page.tsx', 'src/app/(marketing)/layout.tsx',
        'src/app/(app)/dashboard/loading.tsx', 'src/app/globals.css', 'next.config.ts', 'public/hero.webp']),
      { ok: true, violations: [] },
    )
  })

  test('금지 경로는 허용 패턴과 겹쳐도 막는다', () => {
    const r = checkPaths(['src/components/Foo.test.tsx', 'src/app/api/x/route.ts', 'src/lib/a.ts', 'package.json'])
    assert.equal(r.ok, false)
    assert.deepEqual(r.violations, ['src/components/Foo.test.tsx', 'src/app/api/x/route.ts', 'src/lib/a.ts', 'package.json'])
  })

  test('어느 목록에도 없는 경로도 막는다', () => {
    assert.deepEqual(checkPaths(['src/middleware.ts']).violations, ['src/middleware.ts'])
  })

  test('.env 계열과 scripts/ 를 막는다', () => {
    assert.equal(checkPaths(['.env.local']).ok, false)
    assert.equal(checkPaths(['scripts/lighthouse/judge.mjs']).ok, false)
  })
})

describe('guardDrops', () => {
  test('a11y·bp·seo 중 하나라도 1점 떨어지면 잡는다', () => {
    assert.deepEqual(guardDrops(m(60), m(70, [page('/', 70, { seo: 91 })])), ['/:seo 92→91'])
  })

  test('performance 하락은 가드레일이 아니다', () => {
    assert.deepEqual(guardDrops(m(60, [page('/', 60)]), m(61, [page('/', 50)])), [])
  })

  test('기준에 있던 페이지가 빠지면 잡는다', () => {
    assert.deepEqual(guardDrops(m(60), m(70, [page('/x', 70)])), ['/:missing'])
  })
})

describe('decide', () => {
  test('+1.0 은 keep, +0.9 는 discard', () => {
    const r = decide(best, [cand('A', m(60.9)), cand('B', m(61))])
    assert.equal(r.winner, 'B')
    assert.deepEqual(r.results.map((x) => x.status), ['discard', 'keep'])
    assert.match(r.results[0].reason, /\+0\.9/)
  })

  test('조건을 넘은 후보가 여럿이면 최고만 keep, 나머지는 discard', () => {
    const r = decide(best, [cand('A', m(63)), cand('B', m(65)), cand('C', m(62))])
    assert.equal(r.winner, 'B')
    assert.deepEqual(r.results.map((x) => x.status), ['discard', 'keep', 'discard'])
    assert.match(r.results[0].reason, /B/)
  })

  test('가드레일이 떨어지면 점수가 높아도 discard', () => {
    const r = decide(best, [cand('A', m(80, [page('/', 80, { a11y: 94 })]))])
    assert.equal(r.winner, null)
    assert.match(r.results[0].reason, /a11y 95→94/)
  })

  test('crash·scope·nochange 는 측정 없이 그대로 기록한다', () => {
    const r = decide(best, [
      cand('A', undefined, { status: 'crash', reason: 'build 실패' }),
      cand('B', undefined, { status: 'scope', reason: 'src/lib/a.ts' }),
      cand('C', undefined, { status: 'nochange', reason: '변경 없음' }),
    ])
    assert.equal(r.winner, null)
    assert.deepEqual(r.results.map((x) => [x.status, x.perfAvg]), [['crash', null], ['scope', null], ['discard', null]])
  })
})

describe('pickHypotheses', () => {
  const ops = [
    { auditId: 'a', savingsMs: 100, pages: ['/'] },
    { auditId: 'b', savingsMs: 900, pages: ['/'] },
    { auditId: 'c', savingsMs: 500, pages: ['/'] },
    { auditId: 'd', savingsMs: 500, pages: ['/'] },
  ]
  const row = (auditId, status) => ({ run: 1, round: 1, candidate: 'A', auditId, perfAvg: null, minGuard: null, status, commit: '', description: '' })

  test('절감 ms 내림차순, 동률이면 auditId 순', () => {
    assert.deepEqual(pickHypotheses(ops, []).map((o) => o.auditId), ['b', 'c', 'd'])
  })

  test('keep 된 audit 은 다시 고를 수 있고, 실패 2회면 제외', () => {
    const picked = pickHypotheses(ops, [row('b', 'keep'), row('c', 'discard'), row('d', 'crash'), row('d', 'scope')])
    assert.deepEqual(picked.map((o) => o.auditId), ['b', 'c', 'a'])
  })

  test('진단이 모자라면 있는 만큼만', () => {
    assert.deepEqual(pickHypotheses(ops.slice(0, 1), []).map((o) => o.auditId), ['a'])
    assert.deepEqual(pickHypotheses([], []), [])
  })
})

describe('shouldStop', () => {
  const r = (run, round, status) => ({ run, round, candidate: 'A', auditId: 'x', perfAvg: 1, minGuard: 1, status, commit: '', description: '' })

  test('목표 90 에 닿으면 멈춘다', () => {
    assert.deepEqual(shouldStop(90, []), { stop: true, reason: 'target' })
    assert.equal(shouldStop(89.9, []).stop, false)
  })

  test('5라운드 연속 keep 이 없으면 멈춘다 — 실행을 넘어 이어서 센다', () => {
    const h = [r(1, 0, 'baseline'), r(1, 1, 'keep'), r(1, 2, 'discard'), r(2, 0, 'baseline'), r(2, 1, 'discard'), r(2, 2, 'crash'), r(3, 1, 'discard')]
    assert.equal(shouldStop(60, h).stop, false)
    assert.deepEqual(shouldStop(60, [...h, r(3, 2, 'discard')]), { stop: true, reason: 'stall' })
  })

  test('누적 20라운드면 멈춘다', () => {
    const h = Array.from({ length: 20 }, (_, i) => r(Math.floor(i / 2) + 1, (i % 2) + 1, 'keep'))
    assert.deepEqual(shouldStop(60, h), { stop: true, reason: 'max-rounds' })
  })

  test('THRESHOLDS 는 스펙 값이다', () => {
    assert.deepEqual(THRESHOLDS, { MIN_GAIN: 1, TARGET: 90, STALL_ROUNDS: 5, MAX_ROUNDS: 20, CANDIDATES: 3 })
  })
})

describe('TSV', () => {
  const row = { run: 2, round: 1, candidate: 'B', auditId: 'unused-javascript', perfAvg: 63.25, minGuard: 88, status: 'keep', commit: 'abc1234', description: '탭\t과\n개행' }

  test('설명의 탭·개행은 공백으로 바뀌어 한 줄을 지킨다', () => {
    const line = formatRow(row)
    assert.equal(line.split('\t').length, TSV_HEADER.split('\t').length)
    assert.ok(!line.includes('\n'))
  })

  test('format → parse 왕복', () => {
    const parsed = parseHistory(TSV_HEADER + '\n' + formatRow(row) + '\n')
    assert.deepEqual(parsed, [{ ...row, description: '탭 과 개행' }])
  })

  test('측정 없는 줄은 perfAvg·minGuard 가 null', () => {
    const parsed = parseHistory(TSV_HEADER + '\n' + formatRow({ ...row, perfAvg: null, minGuard: null, status: 'crash' }))
    assert.equal(parsed[0].perfAvg, null)
    assert.equal(parsed[0].minGuard, null)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lighthouse/judge.test.mjs`
Expected: FAIL — `Cannot find module './judge.mjs'`

- [ ] **Step 3: Write minimal implementation**

`scripts/lighthouse/judge.mjs`:

```js
// Lighthouse 루프의 판정. 순수 함수만 둔다 — 같은 측정이면 같은 판정이 나와야
// 테스트할 수 있고, LLM 이 결과를 해석할 여지가 없다.

export const THRESHOLDS = { MIN_GAIN: 1, TARGET: 90, STALL_ROUNDS: 5, MAX_ROUNDS: 20, CANDIDATES: 3 }

// 금지가 허용보다 우선한다. `src/components/Foo.test.tsx` 는 components 아래지만 막는다.
const FORBIDDEN = [
  /^src\/app\/api\//,
  /^src\/inngest\//,
  /^src\/lib\//,
  /^src\/services\//,
  /^supabase\//,
  /^scripts\//,
  /\.test\.[^/]+$/,
  /(^|\/)\.env/,
  /^package(-lock)?\.json$/,
]
const ALLOWED = [
  /^src\/components\//,
  /^src\/app\/(.+\/)?(page|layout|loading)\.tsx$/,
  /^src\/app\/globals\.css$/,
  /^next\.config\.ts$/,
  /^public\//,
]

export function checkPaths(paths) {
  const violations = paths.filter(
    (p) => FORBIDDEN.some((re) => re.test(p)) || !ALLOWED.some((re) => re.test(p)),
  )
  return { ok: violations.length === 0, violations }
}

const GUARDS = ['a11y', 'bp', 'seo']

export function guardDrops(best, m) {
  const drops = []
  for (const b of best.perPage) {
    const c = m.perPage.find((p) => p.path === b.path)
    if (!c) {
      drops.push(`${b.path}:missing`)
      continue
    }
    for (const g of GUARDS) {
      if (c[g] < b[g]) drops.push(`${b.path}:${g} ${b[g]}→${c[g]}`)
    }
  }
  return drops
}

const round1 = (n) => Math.round(n * 10) / 10

export function decide(best, candidates) {
  const bestPerf = best.measurement.perfAvg
  const results = candidates.map((c) => {
    const base = { id: c.id, auditId: c.auditId, branch: c.branch, description: c.description }
    if (c.status === 'nochange') return { ...base, status: 'discard', perfAvg: null, reason: c.reason }
    if (c.status !== 'measured') return { ...base, status: c.status, perfAvg: null, reason: c.reason }

    const perfAvg = c.measurement.perfAvg
    const drops = guardDrops(best.measurement, c.measurement)
    if (drops.length) return { ...base, status: 'discard', perfAvg, reason: 'guard ' + drops.join(', ') }

    const gain = round1(perfAvg - bestPerf)
    if (gain < THRESHOLDS.MIN_GAIN) return { ...base, status: 'discard', perfAvg, reason: `gain +${gain} < ${THRESHOLDS.MIN_GAIN}` }
    return { ...base, status: 'eligible', perfAvg, reason: `gain +${gain}` }
  })

  const eligible = results.filter((r) => r.status === 'eligible')
  const winner = eligible.reduce((w, r) => (w && w.perfAvg >= r.perfAvg ? w : r), null)
  for (const r of eligible) {
    if (r === winner) r.status = 'keep'
    else Object.assign(r, { status: 'discard', reason: `${r.reason}, ${winner.id} 에 밀림` })
  }
  return { winner: winner ? winner.id : null, results }
}

const FAILED = new Set(['discard', 'crash', 'scope'])

// keep 된 audit 도 다시 고른다. 가장 큰 진단은 한 번의 최소 변경으로 다 해소되지 않는다.
export function pickHypotheses(opportunities, history, n = THRESHOLDS.CANDIDATES) {
  const fails = {}
  for (const h of history) if (FAILED.has(h.status)) fails[h.auditId] = (fails[h.auditId] ?? 0) + 1

  return opportunities
    .filter((o) => (fails[o.auditId] ?? 0) < 2)
    .sort((a, b) => b.savingsMs - a.savingsMs || a.auditId.localeCompare(b.auditId))
    .slice(0, n)
}

export function shouldStop(bestPerf, history) {
  if (bestPerf >= THRESHOLDS.TARGET) return { stop: true, reason: 'target' }

  // 라운드 = (run, round) 쌍. round 0 은 기준선이라 세지 않는다.
  const rounds = new Map()
  for (const h of history) {
    if (h.round === 0) continue
    const key = `${h.run}:${h.round}`
    rounds.set(key, (rounds.get(key) ?? false) || h.status === 'keep')
  }
  const ordered = [...rounds.entries()]
    .sort(([a], [b]) => {
      const [ar, an] = a.split(':').map(Number)
      const [br, bn] = b.split(':').map(Number)
      return ar - br || an - bn
    })
    .map(([, kept]) => kept)

  if (ordered.length >= THRESHOLDS.MAX_ROUNDS) return { stop: true, reason: 'max-rounds' }
  const tail = ordered.slice(-THRESHOLDS.STALL_ROUNDS)
  if (tail.length === THRESHOLDS.STALL_ROUNDS && tail.every((k) => !k)) return { stop: true, reason: 'stall' }
  return { stop: false, reason: '' }
}

const COLUMNS = ['run', 'round', 'candidate', 'auditId', 'perfAvg', 'minGuard', 'status', 'commit', 'description']
export const TSV_HEADER = COLUMNS.join('\t')

const clean = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ')

export function formatRow(row) {
  return COLUMNS.map((c) => (row[c] === null ? '' : clean(row[c]))).join('\t')
}

const num = (s) => (s === '' ? null : Number(s))

export function parseHistory(text) {
  return text
    .split('\n')
    .slice(1)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const v = line.split('\t')
      return {
        run: Number(v[0]),
        round: Number(v[1]),
        candidate: v[2],
        auditId: v[3],
        perfAvg: num(v[4]),
        minGuard: num(v[5]),
        status: v[6],
        commit: v[7],
        description: v[8] ?? '',
      }
    })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lighthouse/judge.test.mjs`
Expected: PASS, 전 테스트 통과

- [ ] **Step 5: Commit**

```bash
git add scripts/lighthouse/judge.mjs scripts/lighthouse/judge.test.mjs
git commit -m "feat(perf): Lighthouse 루프의 판정을 순수 함수로 둔다"
```

---

### Task 2: `measure.mjs` — 측정 + 의존성 + `pages.json`

**Files:**
- Modify: `package.json` (devDependencies)
- Create: `scripts/lighthouse/measure.mjs`, `scripts/lighthouse/pages.json`
- Test: `scripts/lighthouse/measure.test.mjs`

**Interfaces:**
- Consumes: 없음 (judge 와 독립)
- Produces:
  - CLI: `node scripts/lighthouse/measure.mjs` (cwd = 측정할 체크아웃). stdout = `Measurement` JSON. exit 0 성공 / **1 환경 오류**(멈춰야 함) / **2 빌드 실패**(후보 crash)
  - `export async function measure(cwd) → Measurement` — 실패 시 `MeasureError { code: 1|2, message }` 를 던진다
  - 순수 헬퍼: `median(nums)`, `summarizeLhr(lhr) → { perf, a11y, bp, seo, opportunities: [{auditId, savingsMs}] }`, `aggregate(results: [{ path, runs: Summary[] }]) → Measurement`, `preflightStatus(status, location) → string|null`, `cookieHeader(list) → string`, `readEnvValue(text, key) → string|null`

- [ ] **Step 1: 의존성 추가**

```bash
npm install --save-dev --save-exact lighthouse@13.5.0 chrome-launcher@1.2.2
```

- [ ] **Step 2: Write the failing test**

`scripts/lighthouse/measure.test.mjs`:

```js
// measure 의 순수 헬퍼 테스트 — node --test scripts/lighthouse/
//
// 빌드·서버·Chrome 을 띄우는 본체는 기준선 실측으로 확인한다(Task 6).

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { median, summarizeLhr, aggregate, preflightStatus, cookieHeader, readEnvValue } from './measure.mjs'

const lhr = (perf, extraAudits = {}) => ({
  categories: {
    performance: { score: perf, auditRefs: Object.keys(extraAudits).map((id) => ({ id })) },
    accessibility: { score: 0.95 },
    'best-practices': { score: 1 },
    seo: { score: 0.92 },
  },
  audits: extraAudits,
})

describe('median', () => {
  test('홀수·짝수', () => {
    assert.equal(median([3, 1, 2]), 2)
    assert.equal(median([4, 1, 3, 2]), 2.5)
  })
})

describe('summarizeLhr', () => {
  test('점수를 0~100 정수로 바꾸고 절감 효과가 있는 audit 만 진단으로 뽑는다', () => {
    const s = summarizeLhr(lhr(0.634, {
      'render-blocking-insight': { score: 0, metricSavings: { FCP: 300, LCP: 450 } },
      'unused-javascript': { score: 0.5, metricSavings: { LCP: 200, CLS: 0.1 } },
      'already-good': { score: 1, metricSavings: { LCP: 0 } },
      'informative': { score: null, metricSavings: { LCP: 999 } },
    }))
    assert.deepEqual(s, {
      perf: 63, a11y: 95, bp: 100, seo: 92,
      opportunities: [
        { auditId: 'render-blocking-insight', savingsMs: 750 },
        { auditId: 'unused-javascript', savingsMs: 200 },
      ],
    })
  })

  test('runtimeError 나 null 점수는 0점이 아니라 오류다', () => {
    assert.throws(() => summarizeLhr({ ...lhr(0.5), runtimeError: { code: 'NO_FCP', message: 'x' } }), /NO_FCP/)
    assert.throws(() => summarizeLhr(lhr(null)), /performance/)
  })
})

describe('aggregate', () => {
  test('페이지별 중앙값, 평균은 소수 둘째 자리, 진단은 페이지를 넘어 합산', () => {
    const run = (perf, ops = []) => ({ perf, a11y: 95, bp: 100, seo: 92, opportunities: ops })
    const result = aggregate([
      { path: '/', runs: [run(70, [{ auditId: 'x', savingsMs: 100 }]), run(72), run(71)] },
      { path: '/dashboard', runs: [run(50, [{ auditId: 'x', savingsMs: 300 }]), run(51), run(49, [{ auditId: 'y', savingsMs: 50 }])] },
    ])
    assert.equal(result.perfAvg, 60.5)
    assert.deepEqual(result.perPage, [
      { path: '/', perf: 71, a11y: 95, bp: 100, seo: 92 },
      { path: '/dashboard', perf: 50, a11y: 95, bp: 100, seo: 92 },
    ])
    // 진단 절감 ms 는 3회 평균을 페이지별로 더한다: x = 100/3 + 300/3
    assert.deepEqual(result.opportunities, [
      { auditId: 'x', savingsMs: 133, pages: ['/', '/dashboard'] },
      { auditId: 'y', savingsMs: 17, pages: ['/dashboard'] },
    ])
  })
})

describe('preflightStatus', () => {
  test('200 만 통과, 리다이렉트는 위치를 담아 오류', () => {
    assert.equal(preflightStatus(200, null), null)
    assert.match(preflightStatus(307, '/?redirectTo=%2Fdashboard'), /307.*redirectTo/)
    assert.match(preflightStatus(404, null), /404/)
  })
})

describe('cookieHeader / readEnvValue', () => {
  test('make-cookie 출력 → Cookie 헤더', () => {
    assert.equal(cookieHeader([{ name: 'a', value: 'base64-x' }, { name: 'b', value: 'y' }]), 'a=base64-x; b=y')
  })

  test('.env 텍스트에서 값을 읽는다', () => {
    const text = '# c\nNEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ.a=b\nOTHER=1\n'
    assert.equal(readEnvValue(text, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'), 'eyJ.a=b')
    assert.equal(readEnvValue(text, 'MISSING'), null)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test scripts/lighthouse/measure.test.mjs`
Expected: FAIL — `Cannot find module './measure.mjs'`

- [ ] **Step 4: Write implementation**

`scripts/lighthouse/measure.mjs`:

```js
// 한 체크아웃을 Lighthouse(모바일 기본값)로 잰다. cwd 가 측정 대상이다.
//
//   node scripts/lighthouse/measure.mjs > m.json
//
// exit 1 = 환경 오류(Supabase 꺼짐·쿠키 만료·리다이렉트). 루프를 멈춰야 한다 —
//          후보 실패로 기록하면 이력이 오염된다.
// exit 2 = 빌드 실패. 후보의 잘못이므로 crash 로 기록하고 넘어간다.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 3100
const RUNS = 3
const SUPABASE = 'http://127.0.0.1:54321'
const PAGES = JSON.parse(readFileSync(new URL('./pages.json', import.meta.url), 'utf8'))

export class MeasureError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

export function median(nums) {
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const CATS = { perf: 'performance', a11y: 'accessibility', bp: 'best-practices', seo: 'seo' }
const TIME_METRICS = ['FCP', 'LCP', 'TBT', 'INP']

export function summarizeLhr(lhr) {
  if (lhr.runtimeError) throw new Error(`Lighthouse runtimeError ${lhr.runtimeError.code}: ${lhr.runtimeError.message}`)
  const out = {}
  for (const [key, id] of Object.entries(CATS)) {
    const score = lhr.categories[id]?.score
    if (typeof score !== 'number') throw new Error(`${id} 점수가 없다`)
    out[key] = Math.round(score * 100)
  }
  // Lighthouse 13 은 기존 opportunity audit 상당수를 insight audit 으로 바꿨다.
  // audit 이름에 기대지 않고 metricSavings 가 있는 performance audit 을 모두 진단으로 본다.
  out.opportunities = lhr.categories.performance.auditRefs
    .map(({ id }) => ({ id, a: lhr.audits[id] }))
    .filter(({ a }) => a && typeof a.score === 'number' && a.score < 1 && a.metricSavings)
    .map(({ id, a }) => ({ auditId: id, savingsMs: TIME_METRICS.reduce((s, k) => s + (a.metricSavings[k] ?? 0), 0) }))
    .filter((o) => o.savingsMs > 0)
  return out
}

export function aggregate(results) {
  const perPage = results.map(({ path: p, runs }) => ({
    path: p,
    ...Object.fromEntries(Object.keys(CATS).map((k) => [k, median(runs.map((r) => r[k]))])),
  }))
  const perfAvg = Math.round((perPage.reduce((s, p) => s + p.perf, 0) / perPage.length) * 100) / 100

  const ops = new Map()
  for (const { path: p, runs } of results) {
    for (const r of runs) {
      for (const o of r.opportunities) {
        const e = ops.get(o.auditId) ?? { auditId: o.auditId, total: 0, pages: [] }
        e.total += o.savingsMs / runs.length
        if (!e.pages.includes(p)) e.pages.push(p)
        ops.set(o.auditId, e)
      }
    }
  }
  const opportunities = [...ops.values()]
    .map(({ auditId, total, pages }) => ({ auditId, savingsMs: Math.round(total), pages }))
    .sort((a, b) => b.savingsMs - a.savingsMs)
  return { perfAvg, perPage, opportunities }
}

export function preflightStatus(status, location) {
  if (status === 200) return null
  return `HTTP ${status}${location ? ` → ${location}` : ''}`
}

export function cookieHeader(list) {
  return list.map(({ name, value }) => `${name}=${value}`).join('; ')
}

export function readEnvValue(text, key) {
  const line = text.split('\n').find((l) => l.startsWith(key + '='))
  return line ? line.slice(key.length + 1).trim() : null
}

async function alive(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(3000) })
    return true
  } catch {
    return false
  }
}

function log(msg) {
  process.stderr.write(`[measure] ${msg}\n`)
}

export async function measure(cwd) {
  const envPath = path.join(cwd, '.env.local')
  if (!existsSync(envPath)) throw new MeasureError(1, '.env.local 이 없다. 이대로면 프로덕션 Supabase 를 때린다')
  if (!(await alive(SUPABASE))) throw new MeasureError(1, `로컬 Supabase(${SUPABASE})가 응답하지 않는다. npx supabase start`)
  if (await alive(`http://localhost:${PORT}/`)) throw new MeasureError(1, `포트 ${PORT} 이 이미 쓰이고 있다`)

  log('npm run build')
  const build = spawnSync('npm', ['run', 'build'], { cwd, stdio: ['ignore', 'inherit', 'inherit'] })
  if (build.status !== 0) throw new MeasureError(2, `build 실패 (exit ${build.status})`)

  log(`next start -p ${PORT}`)
  const server = spawn(path.join(cwd, 'node_modules/.bin/next'), ['start', '-p', String(PORT)], {
    cwd, detached: true, stdio: ['ignore', 'ignore', 'inherit'],
  })
  const { launch } = await import('chrome-launcher')
  const { default: lighthouse } = await import('lighthouse')
  let chrome
  try {
    for (let i = 0; i < 60 && !(await alive(`http://localhost:${PORT}/`)); i++) await new Promise((r) => setTimeout(r, 1000))
    if (!(await alive(`http://localhost:${PORT}/`))) throw new MeasureError(1, 'next start 가 60초 안에 뜨지 않았다')

    const anon = readEnvValue(readFileSync(envPath, 'utf8'), 'NEXT_PUBLIC_SUPABASE_ANON_KEY')
    const cookieRun = spawnSync('node', ['scripts/browser-test/make-cookie.mjs'], { cwd, env: { ...process.env, ANON: anon ?? '' }, encoding: 'utf8' })
    if (cookieRun.status !== 0) throw new MeasureError(1, `세션 쿠키 발급 실패: ${cookieRun.stderr.trim()}`)
    const cookie = cookieHeader(JSON.parse(cookieRun.stdout))

    for (const p of PAGES) {
      const res = await fetch(`http://localhost:${PORT}${p.path}`, { redirect: 'manual', headers: p.auth ? { cookie } : {} })
      const err = preflightStatus(res.status, res.headers.get('location'))
      if (err) throw new MeasureError(1, `${p.path} 프리플라이트 실패: ${err}`)
    }

    chrome = await launch({ chromeFlags: ['--headless=new'] })
    const results = []
    for (const p of PAGES) {
      const runs = []
      for (let i = 0; i < RUNS; i++) {
        log(`${p.path} ${i + 1}/${RUNS}`)
        const r = await lighthouse(`http://localhost:${PORT}${p.path}`, {
          port: chrome.port,
          output: 'json',
          logLevel: 'error',
          onlyCategories: Object.values(CATS),
          extraHeaders: p.auth ? { Cookie: cookie } : undefined,
        })
        try {
          runs.push(summarizeLhr(r.lhr))
        } catch (e) {
          throw new MeasureError(1, `${p.path}: ${e.message}`)
        }
      }
      results.push({ path: p.path, runs })
    }
    return aggregate(results)
  } finally {
    if (chrome) await chrome.kill()
    try {
      process.kill(-server.pid, 'SIGTERM')
    } catch {
      // 이미 내려갔다
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  measure(process.cwd()).then(
    (m) => process.stdout.write(JSON.stringify(m) + '\n'),
    (e) => {
      log(e.message)
      process.exit(e instanceof MeasureError ? e.code : 1)
    },
  )
}
```

`scripts/lighthouse/pages.json` — 정적 7개를 먼저 적는다(동적 3개는 Step 6):

```json
[
  { "path": "/", "auth": false },
  { "path": "/dashboard", "auth": true },
  { "path": "/dashboard/billing", "auth": true },
  { "path": "/dashboard/subscriptions", "auth": true },
  { "path": "/dashboard/transactions", "auth": true },
  { "path": "/dashboard/uploads", "auth": true },
  { "path": "/settings", "auth": true }
]
```

`/` 는 `auth: false` 다 — 미들웨어가 로그인 사용자를 `/dashboard` 로 리다이렉트하므로 쿠키를 실으면 랜딩을 잴 수 없다.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test scripts/lighthouse/measure.test.mjs`
Expected: PASS

- [ ] **Step 6: 동적 라우트 URL 채우기**

로컬 Supabase 를 띄우고 테스트 유저 데이터를 조회한다.

```bash
npx supabase start
U="(select id from auth.users where email = 'e2e-test@finsight.app')"
docker exec supabase_db_part2_project_finsight psql -U postgres -d postgres -Atc "
  select 'report', to_char(month, 'YYYY-MM') from public.monthly_reports where user_id = $U order by month desc limit 1;
  select 'signal', to_char(period, 'YYYY-MM') || '/' || id from public.spending_signals where user_id = $U and dismissed_at is null order by period desc, impact desc nulls last limit 1;
  select 'mapping', id from public.upload_jobs where user_id = $U and status = 'needs_mapping' limit 1;"
```

결과로 `pages.json` 에 4개를 추가한다 (`<ym>`, `<ym>/<signalId>`, `<jobId>` 는 위 출력값):

```json
  { "path": "/dashboard/report/<ym>", "auth": true },
  { "path": "/dashboard/review/<ym>", "auth": true },
  { "path": "/dashboard/review/<ym>/<signalId>", "auth": true },
  { "path": "/dashboard/uploads/<jobId>/mapping", "auth": true }
```

**어느 한 줄이라도 비어 나오면 멈추고 사용자에게 묻는다** (스펙은 시드 생성을 범위 밖으로 뒀다). 특히 `needs_mapping` job 은 정상 흐름에서 남아 있지 않을 수 있다.

완료 기준: `pages.json` 이 정확히 11개.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json scripts/lighthouse/measure.mjs scripts/lighthouse/measure.test.mjs scripts/lighthouse/pages.json
git commit -m "feat(perf): 11개 페이지를 모바일 Lighthouse 3회 중앙값으로 재는 measure.mjs"
```

(본체의 실측 확인은 벤치가 준비된 뒤 Task 6 에서 한다.)

---

### Task 3: `round.mjs` — 라운드 절차 CLI + `results.tsv`

**Files:**
- Create: `scripts/lighthouse/round.mjs`, `scripts/lighthouse/results.tsv`
- Test: `scripts/lighthouse/round.test.mjs`

**Interfaces:**
- Consumes: Task 1 의 `checkPaths`, `decide`, `pickHypotheses`, `shouldStop`, `parseHistory`, `formatRow`, `TSV_HEADER`; Task 2 의 `measure(cwd)`, `MeasureError`
- Produces:
  - `node scripts/lighthouse/round.mjs baseline --run N --out <file>` — 이력에 이미 있는 run 이면 `{ ok: false }`
  - `node scripts/lighthouse/round.mjs evaluate --run N --round R --candidates <encoded> --out <file>`
  - `node scripts/lighthouse/round.mjs wait --out <file> [--max 540]` → 파일이 생기면 내용을 출력, 아니면 `{"pending":true}`
  - `--out` 파일 내용(= 워크플로가 받는 상태) `State`:
    ```
    { ok: true, bestCommit: string, bestPerf: number,
      stop: { stop: boolean, reason: string },
      hypotheses: [{ auditId, savingsMs, pages }],
      winner?: string|null, results?: Result[] }
    | { ok: false, error: string }
    ```
  - `<encoded>` = `encodeURIComponent(JSON.stringify([{ id, auditId, branch, description }]))` 에서 `!'()*` 까지 `%XX` 로 바꾼 문자열 (셸 안전 문자만 남는다)
  - 순수 헬퍼: `decodeCandidates(s)`, `classifyCandidate({ exists, isDescendant, changed }) → { status: 'crash'|'scope'|'nochange'|'measure', reason }`, `encodeCandidates(list)`

- [ ] **Step 1: Write the failing test**

`scripts/lighthouse/round.test.mjs`:

```js
// round 의 순수 헬퍼 테스트 — node --test scripts/lighthouse/
//
// git·측정을 실제로 엮는 부분은 Task 6 의 1회 실행으로 확인한다.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { classifyCandidate, encodeCandidates, decodeCandidates } from './round.mjs'

describe('classifyCandidate', () => {
  test('브랜치가 없으면 crash — 후보 에이전트가 커밋하지 못했다', () => {
    assert.deepEqual(classifyCandidate({ exists: false }), { status: 'crash', reason: '브랜치 없음' })
  })

  test('현재 최고 커밋에서 갈라지지 않았으면 scope', () => {
    assert.equal(classifyCandidate({ exists: true, isDescendant: false, changed: ['src/components/A.tsx'] }).status, 'scope')
  })

  test('변경이 없으면 nochange', () => {
    assert.equal(classifyCandidate({ exists: true, isDescendant: true, changed: [] }).status, 'nochange')
  })

  test('금지 경로를 건드리면 scope 와 위반 경로', () => {
    assert.deepEqual(
      classifyCandidate({ exists: true, isDescendant: true, changed: ['src/components/A.tsx', 'src/lib/x.ts'] }),
      { status: 'scope', reason: 'src/lib/x.ts' },
    )
  })

  test('허용 경로만이면 측정한다', () => {
    assert.equal(classifyCandidate({ exists: true, isDescendant: true, changed: ['next.config.ts'] }).status, 'measure')
  })
})

describe('encode/decodeCandidates', () => {
  test('따옴표·괄호·느낌표·한글이 있어도 셸 안전 문자만 남고 왕복된다', () => {
    const list = [{ id: 'A', auditId: 'unused-javascript', branch: 'perf/cand/run1-r1-a', description: `"it's" (lazy)! 지연 로딩*` }]
    const enc = encodeCandidates(list)
    assert.match(enc, /^[A-Za-z0-9\-_.~%]+$/)
    assert.deepEqual(decodeCandidates(enc), list)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lighthouse/round.test.mjs`
Expected: FAIL — `Cannot find module './round.mjs'`

- [ ] **Step 3: Write implementation**

`scripts/lighthouse/results.tsv` (헤더 한 줄 + 개행):

```
run	round	candidate	auditId	perfAvg	minGuard	status	commit	description
```

`scripts/lighthouse/round.mjs`:

```js
// Lighthouse 루프의 한 단계를 결정론적으로 수행한다. 벤치 worktree 에서 실행한다.
//
//   node scripts/lighthouse/round.mjs baseline --run 1 --out .local/lighthouse/run1-base.json
//   node scripts/lighthouse/round.mjs evaluate --run 1 --round 1 --candidates <encoded> --out ...
//   node scripts/lighthouse/round.mjs wait --out ... [--max 540]
//
// 측정 하나가 10분을 넘으므로 에이전트는 nohup 으로 띄우고 wait 로 기다린다.
// 결과는 --out 에 원자적으로(임시 파일 → rename) 쓴다.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, appendFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkPaths, decide, pickHypotheses, shouldStop, parseHistory, formatRow } from './judge.mjs'

const LOOP_BRANCH = 'perf/lighthouse-loop'
const TSV = 'scripts/lighthouse/results.tsv'
const STATE_DIR = '.local/lighthouse'
const BEST = path.join(STATE_DIR, 'best.json')

export function classifyCandidate({ exists, isDescendant, changed }) {
  if (!exists) return { status: 'crash', reason: '브랜치 없음' }
  if (!isDescendant) return { status: 'scope', reason: '현재 최고 커밋에서 갈라지지 않음' }
  if (changed.length === 0) return { status: 'nochange', reason: '변경 없음' }
  const { ok, violations } = checkPaths(changed)
  if (!ok) return { status: 'scope', reason: violations.join(', ') }
  return { status: 'measure', reason: '' }
}

export function encodeCandidates(list) {
  return encodeURIComponent(JSON.stringify(list)).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

export function decodeCandidates(s) {
  return JSON.parse(decodeURIComponent(s))
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const gitOk = (...args) => {
  try {
    execFileSync('git', args, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
const run = (cmd, args) => {
  try {
    execFileSync(cmd, args, { stdio: ['ignore', 2, 2] })
    return true
  } catch {
    return false
  }
}
const log = (msg) => process.stderr.write(`[round] ${msg}\n`)

function assertCleanLoopBranch() {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
  if (branch !== LOOP_BRANCH) throw new Error(`브랜치가 ${LOOP_BRANCH} 가 아니다: ${branch}`)
  if (git('status', '--porcelain') !== '') throw new Error('작업 트리가 깨끗하지 않다')
}

function readHistory() {
  return parseHistory(readFileSync(TSV, 'utf8'))
}

function minGuard(m) {
  return Math.min(...m.perPage.flatMap((p) => [p.a11y, p.bp, p.seo]))
}

function commitTsv(message) {
  git('add', TSV)
  git('commit', '-q', '-m', message)
  return git('rev-parse', 'HEAD')
}

function nextState(best) {
  const history = readHistory()
  return {
    ok: true,
    bestCommit: best.commit,
    bestPerf: best.measurement.perfAvg,
    stop: shouldStop(best.measurement.perfAvg, history),
    hypotheses: pickHypotheses(best.measurement.opportunities, history),
  }
}

async function baseline(runNo) {
  const { measure } = await import('./measure.mjs')
  assertCleanLoopBranch()
  // 같은 번호면 후보 브랜치 이름이 겹쳐 라운드 전체가 scope 로 탈락한다
  if (readHistory().some((h) => h.run === runNo)) throw new Error(`run ${runNo} 은 이미 있다 — 다음 번호를 써라`)
  const measurement = await measure(process.cwd())
  appendFileSync(TSV, formatRow({
    run: runNo, round: 0, candidate: 'base', auditId: '-', perfAvg: measurement.perfAvg,
    minGuard: minGuard(measurement), status: 'baseline', commit: git('rev-parse', '--short', 'HEAD'), description: `run ${runNo} 기준선`,
  }) + '\n')
  const commit = commitTsv(`chore(perf): run ${runNo} 기준선 ${measurement.perfAvg}`)
  const best = { commit, measurement }
  writeFileSync(BEST, JSON.stringify(best))
  return nextState(best)
}

async function evaluate(runNo, roundNo, candidates) {
  const { measure, MeasureError } = await import('./measure.mjs')
  assertCleanLoopBranch()
  const best = JSON.parse(readFileSync(BEST, 'utf8'))
  if (git('rev-parse', 'HEAD') !== best.commit) throw new Error('HEAD 가 best.json 의 커밋과 다르다')

  const judged = []
  try {
    for (const c of candidates) {
      const exists = gitOk('rev-parse', '--verify', '--quiet', `${c.branch}^{commit}`)
      const isDescendant = exists && gitOk('merge-base', '--is-ancestor', best.commit, c.branch)
      const changed = isDescendant ? git('diff', '--name-only', best.commit, c.branch).split('\n').filter(Boolean) : []
      const cls = classifyCandidate({ exists, isDescendant, changed })
      if (cls.status !== 'measure') {
        judged.push({ ...c, ...cls })
        continue
      }

      log(`${c.id} ${c.auditId} — lint·tsc·vitest·측정`)
      git('checkout', '-q', '--detach', c.branch)
      if (!run('npm', ['run', 'lint'])) judged.push({ ...c, status: 'crash', reason: 'lint 실패' })
      // next.config.ts 의 ignoreBuildErrors 로 build 의 타입 검사를 끌 수 있으므로 따로 돌린다
      else if (!run('npx', ['tsc', '--noEmit'])) judged.push({ ...c, status: 'crash', reason: 'tsc 실패' })
      else if (!run('npx', ['vitest', 'run'])) judged.push({ ...c, status: 'crash', reason: 'vitest 실패' })
      else {
        try {
          judged.push({ ...c, status: 'measured', measurement: await measure(process.cwd()) })
        } catch (e) {
          if (e instanceof MeasureError && e.code === 2) judged.push({ ...c, status: 'crash', reason: e.message })
          else throw e // 환경 오류는 후보 탓이 아니다 — 라운드 전체를 멈춘다
        }
      }
      git('checkout', '-q', LOOP_BRANCH)
    }
  } finally {
    git('checkout', '-q', LOOP_BRANCH)
  }

  const decision = decide(best, judged)
  let next = best
  if (decision.winner) {
    const w = judged.find((c) => c.id === decision.winner)
    git('merge', '-q', '--ff-only', w.branch)
    next = { commit: git('rev-parse', 'HEAD'), measurement: w.measurement }
  }

  for (const r of decision.results) {
    const c = judged.find((x) => x.id === r.id)
    appendFileSync(TSV, formatRow({
      run: runNo, round: roundNo, candidate: r.id, auditId: r.auditId, perfAvg: r.perfAvg,
      minGuard: c.measurement ? minGuard(c.measurement) : null, status: r.status,
      commit: gitOk('rev-parse', '--verify', '--quiet', r.branch) ? git('rev-parse', '--short', r.branch) : '',
      description: `${r.description} — ${r.reason}`,
    }) + '\n')
  }
  const head = commitTsv(`chore(perf): run ${runNo} round ${roundNo} — ${decision.winner ? `keep ${decision.winner} ${next.measurement.perfAvg}` : 'keep 없음'}`)
  next = { ...next, commit: head }
  writeFileSync(BEST, JSON.stringify(next))
  return { ...nextState(next), winner: decision.winner, results: decision.results }
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}

function writeOut(out, state) {
  const tmp = out + '.tmp'
  writeFileSync(tmp, JSON.stringify(state) + '\n')
  renameSync(tmp, out)
}

async function waitFor(out, maxSec) {
  for (let i = 0; i < maxSec; i++) {
    if (existsSync(out)) return readFileSync(out, 'utf8')
    await new Promise((r) => setTimeout(r, 1000))
  }
  return JSON.stringify({ pending: true }) + '\n'
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2]
  const out = arg('out')
  if (!out) {
    log('--out 이 필요하다')
    process.exit(64)
  }
  if (cmd === 'wait') {
    process.stdout.write(await waitFor(out, Number(arg('max', '540'))))
  } else {
    mkdirSync(STATE_DIR, { recursive: true })
    try {
      const runNo = Number(arg('run'))
      const state =
        cmd === 'baseline' ? await baseline(runNo)
        : cmd === 'evaluate' ? await evaluate(runNo, Number(arg('round')), decodeCandidates(arg('candidates')))
        : (() => { throw new Error(`알 수 없는 명령: ${cmd}`) })()
      writeOut(out, state)
    } catch (e) {
      log(e.stack ?? e.message)
      writeOut(out, { ok: false, error: e.message })
      process.exitCode = 1
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lighthouse/`
Expected: PASS (judge·measure·round 전부)

- [ ] **Step 5: Commit**

```bash
git add scripts/lighthouse/round.mjs scripts/lighthouse/round.test.mjs scripts/lighthouse/results.tsv
git commit -m "feat(perf): 후보 평가·keep·이력 기록을 수행하는 round.mjs"
```

---

### Task 4: `lighthouse-loop.js` — Workflow 오케스트레이션

**Files:**
- Create: `.claude/workflows/lighthouse-loop.js`
- Test: `.claude/workflows/lighthouse-loop.test.js` (vitest — `vitest.config.ts` 의 `.claude/workflows/**/*.test.js` include 에 이미 걸린다)

**Interfaces:**
- Consumes: Task 3 의 CLI 와 `State` 형태, `encodeCandidates` 와 같은 인코딩 규칙(스크립트 안에 다시 구현 — Workflow 스크립트는 import 불가)
- Produces: `args = { run: number, bench: string, rounds?: number }`. 반환값 `{ run, aborted: string|null, stop: {stop, reason}|null, bestPerf: number|null, rounds: [{ round, winner, results }] }`
- 에이전트 라벨: `measure:baseline`, `cand:<round>:<A|B|C>:<auditId>`, `measure:round<r>`

- [ ] **Step 1: Write the failing test**

`.claude/workflows/lighthouse-loop.test.js`:

```js
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// lighthouse-loop.js 는 Workflow 런타임 전용 스크립트다. review-code.test.js 와 같은 방식으로
// 전역을 스텁으로 주입해 실행하고, 스텁이 받은 호출로 동작을 검증한다.
const WORKFLOW = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lighthouse-loop.js')
const SOURCE = readFileSync(WORKFLOW, 'utf8')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

const hyp = (id, ms = 500) => ({ auditId: id, savingsMs: ms, pages: ['/'] })
const state = (over = {}) => ({ ok: true, bestCommit: 'c0', bestPerf: 60, stop: { stop: false, reason: '' }, hypotheses: [hyp('a'), hyp('b'), hyp('c')], ...over })

async function run({ args = { run: 1, bench: '/bench' }, measures = [], candImpl } = {}) {
  const record = { calls: [], logs: [] }
  let m = 0
  const agent = async (prompt, opts) => {
    record.calls.push({ prompt, opts })
    if (opts.label.startsWith('measure:')) {
      const s = measures[m++]
      return s === undefined ? null : { stdout: typeof s === 'string' ? s : JSON.stringify(s) }
    }
    return candImpl ? candImpl(opts, prompt) : { committed: true, summary: opts.label + ' 요약' }
  }
  const parallel = async (thunks) => Promise.all(thunks.map((t) => Promise.resolve().then(t).catch(() => null)))
  const body = SOURCE.replace(/^export const meta =[\s\S]*?\n}\n/m, '')
  const fn = new AsyncFunction('agent', 'parallel', 'phase', 'log', 'args', body)
  const result = await fn(agent, parallel, () => {}, (msg) => record.logs.push(msg), args)
  return { result, record }
}

const labels = (record) => record.calls.map((c) => c.opts.label)

describe('lighthouse-loop', () => {
  it('기준선 + 2라운드 = 에이전트 9개, 후보는 worktree 격리', async () => {
    const { result, record } = await run({ measures: [state(), state({ winner: 'B', results: [] }), state({ winner: null, results: [] })] })
    expect(labels(record)).toEqual([
      'measure:baseline',
      'cand:1:A:a', 'cand:1:B:b', 'cand:1:C:c', 'measure:round1',
      'cand:2:A:a', 'cand:2:B:b', 'cand:2:C:c', 'measure:round2',
    ])
    expect(record.calls.filter((c) => c.opts.label.startsWith('cand:')).every((c) => c.opts.isolation === 'worktree')).toBe(true)
    expect(result.rounds.map((r) => r.winner)).toEqual(['B', null])
    expect(result.aborted).toBeNull()
  })

  it('후보 프롬프트에 브랜치 이름·기준 커밋이 들어간다', async () => {
    const { record } = await run({ args: { run: 3, bench: '/bench', rounds: 1 }, measures: [state({ bestCommit: 'deadbeef' }), state()] })
    const p = record.calls[1].prompt
    expect(p).toContain('perf/cand/run3-r1-a')
    expect(p).toContain('deadbeef')
  })

  it('측정 프롬프트는 벤치에서 round.mjs 를 nohup 으로 띄우고 wait 로 기다리게 한다', async () => {
    const { record } = await run({ args: { run: 1, bench: '/bench', rounds: 1 }, measures: [state(), state()] })
    const base = record.calls[0].prompt
    expect(base).toContain('cd /bench')
    expect(base).toContain('round.mjs baseline --run 1')
    expect(base).toContain('round.mjs wait')
    const evalPrompt = record.calls.at(-1).prompt
    expect(evalPrompt).toMatch(/round\.mjs evaluate --run 1 --round 1 --candidates [A-Za-z0-9\-_.~%]+ /)
  })

  it('인코딩된 후보 목록은 디코드하면 원래 목록이고, 실패한 후보는 설명이 대체된다', async () => {
    const { record } = await run({
      args: { run: 1, bench: '/bench', rounds: 1 },
      measures: [state(), state()],
      candImpl: (opts) => (opts.label.includes(':B:') ? null : { committed: true, summary: `"q" (x)!` }),
    })
    const enc = /--candidates (\S+)/.exec(record.calls.at(-1).prompt)[1]
    expect(JSON.parse(decodeURIComponent(enc))).toEqual([
      { id: 'A', auditId: 'a', branch: 'perf/cand/run1-r1-a', description: `"q" (x)!` },
      { id: 'B', auditId: 'b', branch: 'perf/cand/run1-r1-b', description: '후보 에이전트 실패' },
      { id: 'C', auditId: 'c', branch: 'perf/cand/run1-r1-c', description: `"q" (x)!` },
    ])
  })

  it('진단이 2개면 후보도 2개, 0개면 라운드를 돌지 않는다', async () => {
    const two = await run({ args: { run: 1, bench: '/bench', rounds: 1 }, measures: [state({ hypotheses: [hyp('a'), hyp('b')] }), state()] })
    expect(labels(two.record)).toEqual(['measure:baseline', 'cand:1:A:a', 'cand:1:B:b', 'measure:round1'])

    const none = await run({ measures: [state({ hypotheses: [] })] })
    expect(labels(none.record)).toEqual(['measure:baseline'])
    expect(none.result.stop).toEqual({ stop: true, reason: 'no-hypotheses' })
  })

  it('종료 조건이 서면 다음 라운드를 돌지 않는다', async () => {
    const { result, record } = await run({ measures: [state(), state({ stop: { stop: true, reason: 'target' }, winner: 'A', results: [] })] })
    expect(labels(record).filter((l) => l.startsWith('measure:'))).toEqual(['measure:baseline', 'measure:round1'])
    expect(result.stop.reason).toBe('target')
  })

  it('측정이 ok:false·JSON 아님·null 이면 중단하고 이유를 남긴다', async () => {
    const a = await run({ measures: [{ ok: false, error: '로컬 Supabase 가 응답하지 않는다' }] })
    expect(a.result.aborted).toContain('Supabase')
    const b = await run({ measures: ['not json'] })
    expect(b.result.aborted).toMatch(/JSON/)
    const c = await run({ measures: [] })
    expect(c.result.aborted).toMatch(/측정 에이전트/)
    expect(labels(c.record)).toEqual(['measure:baseline'])
  })

  it('run·bench 가 없으면 에이전트를 띄우지 않고 던진다', async () => {
    await expect(run({ args: { run: 1 } })).rejects.toThrow(/bench/)
    await expect(run({ args: { bench: '/b' } })).rejects.toThrow(/run/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run .claude/workflows/lighthouse-loop.test.js`
Expected: FAIL — `ENOENT ... lighthouse-loop.js`

- [ ] **Step 3: Write implementation**

`.claude/workflows/lighthouse-loop.js`:

```js
export const meta = {
  name: 'lighthouse-loop',
  description: 'Lighthouse(모바일) 점수를 autoresearch 방식으로 올린다 — 라운드마다 후보 3개를 만들고 최고만 keep',
  whenToUse: '벤치 worktree 가 준비된 뒤 scriptPath 로 호출 (scripts/lighthouse/program.md 실행 절차)',
  phases: [
    { title: 'Baseline', detail: '현재 최고 커밋 재측정' },
    { title: 'Round', detail: '후보 3개 병렬 → 직렬 측정 → 최고만 keep' },
  ],
}

// 이 스크립트는 셸·파일 접근이 없다. 측정·판정·git 은 전부 벤치의 round.mjs 가 하고,
// 측정 에이전트는 그 출력(JSON)을 그대로 돌려줄 뿐이다. 판정을 LLM 이 하지 않게 하려는 것이다.
const a = typeof args !== 'undefined' && args ? args : {}
if (!a.bench) throw new Error('args.bench(벤치 worktree 절대 경로)가 필요하다')
if (!a.run) throw new Error('args.run(실행 번호)이 필요하다')
const RUN = a.run
const BENCH = a.bench
const ROUNDS = a.rounds || 2
const IDS = ['A', 'B', 'C']

const MEASURE_SCHEMA = {
  type: 'object',
  properties: { stdout: { type: 'string', description: '마지막 wait 출력 JSON 한 줄, 가공 없이 그대로' } },
  required: ['stdout'],
}
const CAND_SCHEMA = {
  type: 'object',
  properties: {
    committed: { type: 'boolean', description: '지정 브랜치에 커밋했는가' },
    summary: { type: 'string', description: '무엇을 왜 바꿨는지 한 줄' },
  },
  required: ['committed', 'summary'],
}

// round.mjs 의 encodeCandidates 와 같은 규칙. 스크립트는 import 할 수 없어 다시 둔다.
const encode = (list) =>
  encodeURIComponent(JSON.stringify(list)).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

function measurePrompt(name, cliArgs) {
  const out = `.local/lighthouse/run${RUN}-${name}.json`
  return [
    `Lighthouse 루프의 측정 단계를 실행하고 결과를 그대로 돌려준다. 해석·요약·재시도 금지.`,
    ``,
    `1. 실행 (Bash, 한 번만):`,
    `   cd ${BENCH} && mkdir -p .local/lighthouse && rm -f ${out} && nohup node scripts/lighthouse/round.mjs ${cliArgs} --out ${out} > ${out}.log 2>&1 &`,
    `2. 대기: 아래를 반복한다. 출력이 {"pending":true} 이면 같은 명령을 다시 실행한다. 한 번에 최대 9분 걸린다.`,
    `   cd ${BENCH} && node scripts/lighthouse/round.mjs wait --out ${out} --max 540`,
    `3. pending 이 아닌 출력이 나오면 그 JSON 한 줄을 stdout 필드에 그대로 담아 반환한다.`,
    ``,
    `규칙: 1번 명령을 두 번 실행하지 않는다(측정이 겹치면 점수가 흔들린다). 파일·브랜치를 고치지 않는다.`,
    `90분이 지나도 끝나지 않으면 stdout 에 {"ok":false,"error":"timeout — ${out}.log 확인"} 을 담아 반환한다.`,
  ].join('\n')
}

function candidatePrompt(c, bestCommit) {
  return [
    `Lighthouse(모바일) Performance 를 올리는 후보 변경 하나를 만든다.`,
    ``,
    `겨냥할 진단: \`${c.auditId}\` — 예상 절감 ${c.savingsMs}ms, 해당 페이지 ${c.pages.join(', ')}`,
    ``,
    `1. git switch -c ${c.branch} ${bestCommit}`,
    `2. scripts/lighthouse/program.md 를 읽고 그 규칙대로 수정한다.`,
    `3. git add 후 git commit -m "perf: <한 줄 요약>" — 브랜치 ${c.branch} 에 커밋 1개.`,
    `4. push 하지 않는다. 빌드·Lighthouse 는 돌리지 않는다(이 worktree 에는 node_modules 가 없다 — 측정은 다른 곳에서 한다).`,
    ``,
    `고칠 만한 것이 없다고 판단하면 커밋하지 말고 committed=false 와 이유를 반환한다.`,
  ].join('\n')
}

async function step(label, name, cliArgs) {
  const r = await agent(measurePrompt(name, cliArgs), { label, phase: label === 'measure:baseline' ? 'Baseline' : 'Round', schema: MEASURE_SCHEMA, effort: 'low' })
  if (!r) return { ok: false, error: '측정 에이전트가 결과 없이 끝났다' }
  try {
    return JSON.parse(r.stdout)
  } catch {
    return { ok: false, error: `측정 출력이 JSON 이 아니다: ${String(r.stdout).slice(0, 200)}` }
  }
}

const summary = { run: RUN, aborted: null, stop: null, bestPerf: null, rounds: [] }

phase('Baseline')
let s = await step('measure:baseline', 'base', `baseline --run ${RUN}`)

for (let r = 1; s.ok && r <= ROUNDS; r++) {
  if (s.stop.stop) break
  if (!s.hypotheses.length) {
    s = { ...s, stop: { stop: true, reason: 'no-hypotheses' } }
    break
  }

  phase('Round')
  const cands = s.hypotheses.slice(0, IDS.length).map((h, i) => ({
    ...h, id: IDS[i], branch: `perf/cand/run${RUN}-r${r}-${IDS[i].toLowerCase()}`,
  }))
  log(`run ${RUN} round ${r}: ${cands.map((c) => `${c.id}=${c.auditId}`).join(' ')} (현재 ${s.bestPerf})`)

  const bestCommit = s.bestCommit
  const outs = await parallel(cands.map((c) => () =>
    agent(candidatePrompt(c, bestCommit), { label: `cand:${r}:${c.id}:${c.auditId}`, phase: 'Round', isolation: 'worktree', schema: CAND_SCHEMA })))

  const list = cands.map((c, i) => ({
    id: c.id, auditId: c.auditId, branch: c.branch,
    description: outs[i] ? outs[i].summary : '후보 에이전트 실패',
  }))
  s = await step(`measure:round${r}`, `r${r}`, `evaluate --run ${RUN} --round ${r} --candidates ${encode(list)}`)
  if (s.ok) {
    summary.rounds.push({ round: r, winner: s.winner, results: s.results })
    log(`round ${r}: ${s.winner ? `keep ${s.winner} → ${s.bestPerf}` : 'keep 없음'}`)
  }
}

if (!s.ok) summary.aborted = s.error
else {
  summary.stop = s.stop
  summary.bestPerf = s.bestPerf
}
return summary
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run .claude/workflows/lighthouse-loop.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add .claude/workflows/lighthouse-loop.js .claude/workflows/lighthouse-loop.test.js
git commit -m "feat(perf): 후보 3개를 병렬로 만들고 측정은 직렬로 맡기는 lighthouse-loop 워크플로"
```

---

### Task 5: `program.md` — 후보 지침과 실행 절차

**Files:**
- Create: `scripts/lighthouse/program.md`

**Interfaces:**
- Consumes: Task 4 의 후보 프롬프트가 이 파일을 읽으라고 지시한다. Task 3 CLI, Task 4 의 `args`
- Produces: 사람과 후보 에이전트가 읽는 문서

- [ ] **Step 1: 작성**

`scripts/lighthouse/program.md`:

````markdown
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

`npx supabase db reset` 을 했다면 signal·upload id 가 바뀌어 프리플라이트가 404 로 멈춘다.
`pages.json` 의 동적 URL 을 다시 채운다(구현 계획 Task 2 Step 6 의 조회).

### 결과 반영

루프 브랜치는 push 하지 않는다. 쓸 만한 커밋을 골라 별도 브랜치로 PR 을 만든다.
후보 브랜치 `perf/cand/*` 는 정리할 때 `git branch -D` 로 지운다.
````

- [ ] **Step 2: 확인**

Run: `grep -n "program.md" .claude/workflows/lighthouse-loop.js`
Expected: 후보 프롬프트가 `scripts/lighthouse/program.md` 를 가리킨다

- [ ] **Step 3: Commit**

```bash
git add scripts/lighthouse/program.md
git commit -m "docs(perf): Lighthouse 루프 후보 지침과 실행 절차"
```

---

### Task 6: 벤치 준비 + 기준선 실측 + 1회 실행

이 태스크는 코드를 쓰지 않는다. 앞 태스크들이 실제 환경에서 맞물리는지 확인한다. **실행 전 사용자 확인을 받는다** — 9개 에이전트, 약 1~1.5시간이 든다.

- [ ] **Step 1: 전체 테스트**

Run: `node --test scripts/lighthouse/ && npx vitest run .claude/workflows/lighthouse-loop.test.js && npm run lint && npm run build`
Expected: 모두 통과

- [ ] **Step 2: 벤치 준비** — `program.md` "최초 1회" 절 그대로

```bash
git switch main
git worktree add ~/.cache/finsight-lighthouse/bench perf/lighthouse-loop
cp .env .env.local ~/.cache/finsight-lighthouse/bench/
(cd ~/.cache/finsight-lighthouse/bench && npm ci)
```

- [ ] **Step 3: measure.mjs 단독 실측** (벤치에서, 백그라운드)

```bash
cd ~/.cache/finsight-lighthouse/bench && mkdir -p .local/lighthouse && \
  nohup node scripts/lighthouse/measure.mjs > .local/lighthouse/smoke.json 2> .local/lighthouse/smoke.log &
```

완료 후 확인: `smoke.json` 의 `perPage` 가 11개, 모든 점수가 0~100, `opportunities` 가 1개 이상. 실패면 `smoke.log` 를 보고 고친다(이 단계에서 Lighthouse 13 의 audit 형태가 가정과 다르면 `summarizeLhr` 와 그 테스트를 함께 고친다).

- [ ] **Step 4: 사용자 확인 후 워크플로 1회 실행**

`Workflow({ scriptPath: '<벤치>/.claude/workflows/lighthouse-loop.js', args: { run: 1, bench: '<벤치 절대 경로>' } })` — `name` 으로는 못 찾는다(메인 체크아웃은 main)

완료 기준:
- `results.tsv` 에 run 1 의 기준선 1줄 + 라운드마다 후보 줄
- `git log perf/lighthouse-loop` 에 keep 된 후보 커밋(있다면)과 라운드마다 tsv 커밋
- 반환값의 `aborted` 가 null

- [ ] **Step 5: 결과 보고** — `results.tsv` 를 표로 요약해 사용자에게 보여주고 다음 실행 여부를 묻는다
