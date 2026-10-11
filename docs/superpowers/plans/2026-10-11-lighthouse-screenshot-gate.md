# Lighthouse 루프 스크린샷 관문 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 후보의 최종 화면이 기준선과 픽셀 단위로 다르면 점수와 무관하게 `visual` 로 탈락시키는 관문을 루프에 넣고, tsc 를 build 뒤로 옮겨 `.next/types` 결함을 없앤다.

**Architecture:** `measure.mjs` 를 `preflight`·`build`·`withServer`·`lighthouse` 로 나눠 서버 한 번으로 촬영과 측정을 함께 한다. 새 `shots.mjs` 가 puppeteer 로 22장을 찍고 sharp 로 비교한다(순수 판정 함수는 TDD). `round.mjs` 는 baseline 에서 기준 이미지를 확정하고, evaluate 에서 lint → build → tsc → vitest → 촬영 → Lighthouse 순으로 후보를 검사한다.

**Tech Stack:** Node ESM(`.mjs`), `node --test`, `puppeteer-core@25.13.0`, `sharp@0.35.4`, `chrome-launcher@1.2.2`, `lighthouse@13.5.0`, Next 15

**Spec:** `docs/superpowers/specs/2026-10-11-lighthouse-loop-design.md` ("스크린샷 관문" 절과 그에 맞춰 바뀐 구성 요소·테스트 절)

## Global Constraints

- 모든 작업은 벤치 worktree `~/.cache/finsight-lighthouse/bench`(브랜치 `perf/lighthouse-loop`)에서 한다. 메인 체크아웃에서 `git switch perf/lighthouse-loop` 금지
- push 금지. 마이그레이션·`.env*` 를 건드리지 않는다
- 로컬 DB `npx supabase db reset`·`scripts/browser-test/reset.sh` 금지(매핑 fixture `33dad667-…` 가 사라진다)
- 서버 종료는 `lsof -tiTCP:3100 -sTCP:LISTEN | xargs kill`. `pkill -f "next start"` 는 Next 15 의 `next-server` 를 못 잡는다
- `.next/types` 만 지우지 않는다. 지우려면 `.next` 통째로
- **측정·촬영이 백그라운드로 도는 동안 턴을 끝내지 않는다.** Stop 훅(`npm run lint && npm run build && npm run test`)이 벤치의 `.next` 를 덮어쓸 수 있다. foreground 로 `round.mjs wait --max 540`(Bash timeout 600000)을 반복한다
- 판정 규칙: 22장 중 한 장이라도 RGB 채널 차이 > 16 픽셀이 1개 이상이거나 크기가 다르면(재촬영 2회 후에도) `visual`. 허용치 없음
- 촬영 조건: DPR 1, `networkidle0`, 애니메이션·transition·caret 끄는 style 주입, `document.fonts.ready`, +500ms, fullPage. 뷰포트 모바일 390×844(isMobile, hasTouch) · 데스크톱 1440×900
- 테스트 실행: `node --test scripts/lighthouse/*.test.mjs`. 새 로직은 테스트 먼저(TDD)
- 커밋 메시지는 conventional commits, 끝에 아래 두 줄:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01TpVq8DiRtPBJtbqzhoYhCD
  ```

## Review Focus

1. run 도중 서울 기준 자정을 넘기면 대시보드 일자·체험 잔여일이 서버에서 바뀐다 → 모든 후보 `visual` 이 아니라 환경 오류로 멈춰야 한다 — Task 5 `seoulDate` 테스트 + `inspect` 의 날짜 확인
2. `db reset` 등으로 `screens.json` 의 동적 URL 이 404·리다이렉트가 되면 → 후보 `visual`/`crash` 가 아니라 환경 오류(exit 1)로 루프가 멈춰야 한다 — Task 3 `navErrorCode` 테스트
3. 후보 촬영이 일부 화면에서 파일을 남기지 못했으면(크기 null) → 같은 것으로 보지 말고 차이로 판정 — Task 3 `judgeShots` 테스트
4. 이전 실행이 남긴 `best.json` 에 `refDir`·`refDate` 가 없거나 디렉터리가 지워졌으면 → evaluate 가 비교를 건너뛰지 말고 중단 — Task 5 `missingRef` 테스트
5. 22장이 전부 다르면(글꼴 변경) reason 이 수천 자가 돼 `results.tsv` 를 망친다 → 앞 3개 + "외 N장" — Task 5 `visualReason` 테스트

---

### Task 1: judge — `visual` 상태를 실패로 센다

**Files:**
- Modify: `scripts/lighthouse/judge.mjs` (`const FAILED = …` 줄)
- Test: `scripts/lighthouse/judge.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces: `decide()` 가 `status: 'visual'` 후보를 측정값 없이 그대로 탈락시킨다(기존 `c.status !== 'measured'` 분기). `pickHypotheses()` 가 `visual` 을 실패로 센다

- [ ] **Step 1: 실패하는 테스트 작성** — `judge.test.mjs` 의 `decide`·`pickHypotheses` describe 블록 안에 각각 추가

```js
  test('visual 후보는 측정값 없이 탈락하고, 다른 후보가 keep 돼도 outcompeted 로 바뀌지 않는다', () => {
    const r = decide(best, [
      cand('A', m(70)),
      { id: 'B', auditId: 'audit-B', branch: 'perf/cand/B', description: 'B 설명', status: 'visual', reason: 'mobile / 1.20%' },
    ])
    assert.equal(r.winner, 'A')
    const b = r.results.find((x) => x.id === 'B')
    assert.deepEqual([b.status, b.perfAvg, b.reason], ['visual', null, 'mobile / 1.20%'])
  })
```

```js
  test('visual 도 실패로 센다 — 화면을 두 번 깨뜨린 진단은 다시 고르지 않는다', () => {
    const ops = [{ auditId: 'font', savingsMs: 900, pages: ['/'] }, { auditId: 'js', savingsMs: 100, pages: ['/'] }]
    const history = [
      { run: 1, round: 1, auditId: 'font', status: 'visual' },
      { run: 1, round: 2, auditId: 'font', status: 'visual' },
    ]
    assert.deepEqual(pickHypotheses(ops, history).map((o) => o.auditId), ['js'])
  })
```

- [ ] **Step 2: 실패 확인**

Run: `node --test scripts/lighthouse/judge.test.mjs`
Expected: 첫 테스트는 PASS(기존 분기가 이미 처리), 두 번째는 FAIL — `['font', 'js']` ≠ `['js']`

- [ ] **Step 3: 구현** — `judge.mjs`

```js
const FAILED = new Set(['discard', 'crash', 'scope', 'visual'])
```

- [ ] **Step 4: 통과 확인**

Run: `node --test scripts/lighthouse/judge.test.mjs`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add scripts/lighthouse/judge.mjs scripts/lighthouse/judge.test.mjs
git commit -m "feat(perf): 화면을 바꾼 후보(visual)를 실패로 세어 같은 진단을 두 번까지만 고른다"
```

---

### Task 2: measure — build·서버·Lighthouse 를 분리

**Files:**
- Modify: `scripts/lighthouse/measure.mjs` (`measure()` 함수 전체를 아래로 교체, CLI 블록 유지)
- Test: `scripts/lighthouse/measure.test.mjs` (기존 테스트가 그대로 통과해야 한다 — 바뀌는 것은 I/O 본체뿐)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `preflight(cwd: string): Promise<void>` — `.env.local`·로컬 Supabase·포트 3100 확인, 실패 시 `MeasureError(1)`
  - `build(cwd: string): void` — `npm run build`, 실패 시 `MeasureError(2)`
  - `withServer<T>(cwd: string, fn: (server: { baseUrl: string, cookies: {name,value}[] }) => Promise<T>): Promise<T>` — `next start`·쿠키·`pages.json` 프리플라이트 후 `fn` 호출, 항상 서버 종료 후 포트가 닫힐 때까지(최대 10초) 기다린다
  - `lighthouse(server): Promise<{ perfAvg, perPage, opportunities }>`
  - `measure(cwd)` — 위 넷의 합성. CLI 동작 불변

- [ ] **Step 1: 리팩터 전 기준 확인**

Run: `node --test scripts/lighthouse/measure.test.mjs`
Expected: PASS

- [ ] **Step 2: 구현** — `measure.mjs` 의 `export async function measure(cwd) { … }` 를 통째로 아래로 바꾼다. `PORT` 상수 아래에 `const BASE = \`http://localhost:${PORT}\`` 를 추가한다

```js
export async function preflight(cwd) {
  if (!existsSync(path.join(cwd, '.env.local'))) throw new MeasureError(1, '.env.local 이 없다. 이대로면 프로덕션 Supabase 를 때린다')
  if (!(await alive(SUPABASE))) throw new MeasureError(1, `로컬 Supabase(${SUPABASE})가 응답하지 않는다. npx supabase start`)
  if (await alive(`${BASE}/`)) throw new MeasureError(1, `포트 ${PORT} 이 이미 쓰이고 있다`)
}

export function build(cwd) {
  log('npm run build')
  const r = spawnSync('npm', ['run', 'build'], { cwd, stdio: ['ignore', 2, 2] })
  if (r.status !== 0) throw new MeasureError(2, `build 실패 (exit ${r.status})`)
}

// 서버 한 번으로 촬영과 측정을 함께 하려고 수명주기를 떼어 둔다. 끝나면 항상 서버를 끈다 —
// 프로세스 그룹 kill 이라 Next 15 가 이름을 next-server 로 바꿔도 잡힌다.
export async function withServer(cwd, fn) {
  log(`next start -p ${PORT}`)
  const server = spawn(path.join(cwd, 'node_modules/.bin/next'), ['start', '-p', String(PORT)], {
    cwd, detached: true, stdio: ['ignore', 'ignore', 'inherit'],
  })
  try {
    for (let i = 0; i < 60 && !(await alive(`${BASE}/`)); i++) await new Promise((r) => setTimeout(r, 1000))
    if (!(await alive(`${BASE}/`))) throw new MeasureError(1, 'next start 가 60초 안에 뜨지 않았다')

    const anon = readEnvValue(readFileSync(path.join(cwd, '.env.local'), 'utf8'), 'NEXT_PUBLIC_SUPABASE_ANON_KEY')
    const cookieRun = spawnSync('node', ['scripts/browser-test/make-cookie.mjs'], { cwd, env: { ...process.env, ANON: anon ?? '' }, encoding: 'utf8' })
    if (cookieRun.status !== 0) throw new MeasureError(1, `세션 쿠키 발급 실패: ${cookieRun.stderr.trim()}`)
    const cookies = JSON.parse(cookieRun.stdout)
    const cookie = cookieHeader(cookies)

    for (const p of PAGES) {
      const res = await fetch(`${BASE}${p.path}`, { redirect: 'manual', headers: p.auth ? { cookie } : {} })
      const err = preflightStatus(res.status, res.headers.get('location'))
      if (err) throw new MeasureError(preflightErrorCode(res.status), `${p.path} 프리플라이트 실패: ${err}`)
    }
    return await fn({ baseUrl: BASE, cookies })
  } finally {
    try {
      process.kill(-server.pid, 'SIGTERM')
    } catch {
      // 이미 내려갔다
    }
    // 다음 후보의 preflight 가 내려가는 중인 서버를 "포트 사용 중" 으로 오인해 라운드를 멈추지 않게 한다
    for (let i = 0; i < 10 && (await alive(`${BASE}/`)); i++) await new Promise((r) => setTimeout(r, 1000))
  }
}

export async function lighthouse({ baseUrl, cookies }) {
  const { launch } = await import('chrome-launcher')
  const { default: runLighthouse } = await import('lighthouse')
  const cookie = cookieHeader(cookies)
  const chrome = await launch({ chromeFlags: ['--headless=new'] })
  try {
    const results = []
    for (const p of PAGES) {
      const runs = []
      for (let i = 0; i < RUNS; i++) {
        log(`${p.path} ${i + 1}/${RUNS}`)
        const r = await runLighthouse(`${baseUrl}${p.path}`, {
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
    await chrome.kill()
  }
}

export async function measure(cwd) {
  await preflight(cwd)
  build(cwd)
  return withServer(cwd, lighthouse)
}
```

- [ ] **Step 3: 단위 테스트·lint 확인**

Run: `node --test scripts/lighthouse/measure.test.mjs && node --check scripts/lighthouse/measure.mjs`
Expected: PASS, 문법 오류 없음 (`scripts/**` 는 ESLint 대상이 아니다)

- [ ] **Step 4: 커밋** — 실제 build·서버·Lighthouse 동작은 Task 4(`withServer`)와 Task 6 baseline(`lighthouse`)이 실행으로 확인한다

```bash
git add scripts/lighthouse/measure.mjs
git commit -m "refactor(perf): measure 를 preflight·build·withServer·lighthouse 로 나눠 서버 한 번으로 촬영과 측정을 함께 한다"
```

---

### Task 3: shots — 순수 판정 함수와 촬영 대상

**Files:**
- Create: `scripts/lighthouse/shots.mjs` (이 Task 에서는 순수 함수만)
- Create: `scripts/lighthouse/screens.json`
- Create: `scripts/lighthouse/shots.test.mjs`
- Modify: `package.json`, `package-lock.json` (devDependencies 명시)

**Interfaces:**
- Consumes: `MeasureError`, `preflightErrorCode(status)` (`measure.mjs`)
- Produces:
  - `VIEWPORTS`, `THRESHOLD = 16`, `RETAKES = 2`
  - `shotName(viewport, path) → string` (예: `mobile__root.png`, `desktop_dashboard_uploads.png`)
  - `listScreens(screens: {path, auth}[]) → {viewport, path, auth, name, label}[]` — 뷰포트 우선(모바일 11개 → 데스크톱 11개), `label = '<viewport> <path>'`
  - `comparePixels(a: Uint8Array, b: Uint8Array) → { count, mask }` — RGBA 버퍼, RGB 최대 채널 차이 > THRESHOLD 인 픽셀 수
  - `judgeShots(results) → { ok, diffs: string[] }` — `results[i] = { label, sizeA, sizeB, diffPx, total }`
  - `pickRetakes(results) → string[]` (다른 화면의 `name`)
  - `navErrorCode(status, redirected) → null | 1 | 2`

- [ ] **Step 1: devDependencies 명시** — 지금은 lighthouse·next 의 전이 의존성으로만 있어 호이스팅이 바뀌면 사라진다

Run: `npm i -D --save-exact puppeteer-core@25.13.0 sharp@0.35.4 && git diff --stat package.json package-lock.json`
Expected: `package.json` devDependencies 에 두 줄 추가, lock 변경은 루트 의존 표기 정도(새 다운로드 없음)

- [ ] **Step 2: `screens.json` 작성**

```json
[
  { "path": "/", "auth": false },
  { "path": "/dashboard", "auth": true },
  { "path": "/dashboard/billing", "auth": true },
  { "path": "/dashboard/subscriptions", "auth": true },
  { "path": "/dashboard/transactions", "auth": true },
  { "path": "/dashboard/uploads", "auth": true },
  { "path": "/settings", "auth": true },
  { "path": "/dashboard/report/2026-07", "auth": true },
  { "path": "/dashboard/review/2026-07", "auth": true },
  { "path": "/dashboard/review/2026-07/8f20fc98-3cce-47d4-a586-f68e0712291f", "auth": true },
  { "path": "/dashboard/uploads/33dad667-f976-4661-8760-eef8a6f91085/mapping", "auth": true }
]
```

- [ ] **Step 3: 실패하는 테스트 작성** — `shots.test.mjs`

```js
// shots 의 순수 판정 테스트 — node --test scripts/lighthouse/*.test.mjs
//
// 촬영(puppeteer)·비교(sharp) 본체는 Task 4 의 CLI 실측과 Task 6 의 관문 실측으로 확인한다.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { shotName, listScreens, comparePixels, judgeShots, pickRetakes, navErrorCode } from './shots.mjs'

const px = (...rgba) => Uint8Array.from(rgba)
const r = (label, extra = {}) => ({ label, name: label.replace(' ', '_') + '.png', sizeA: '390x844', sizeB: '390x844', diffPx: 0, total: 390 * 844, ...extra })

describe('shotName·listScreens', () => {
  test('루트는 __root, 나머지는 / 를 _ 로', () => {
    assert.equal(shotName('mobile', '/'), 'mobile__root.png')
    assert.equal(shotName('desktop', '/dashboard/uploads'), 'desktop_dashboard_uploads.png')
  })

  test('뷰포트 × 화면, 모바일 먼저', () => {
    const s = listScreens([{ path: '/', auth: false }, { path: '/dashboard', auth: true }])
    assert.deepEqual(s.map((x) => x.label), ['mobile /', 'mobile /dashboard', 'desktop /', 'desktop /dashboard'])
    assert.deepEqual(s[1], { viewport: 'mobile', path: '/dashboard', auth: true, name: 'mobile_dashboard.png', label: 'mobile /dashboard' })
  })
})

describe('comparePixels', () => {
  test('같으면 0', () => {
    assert.equal(comparePixels(px(10, 20, 30, 255), px(10, 20, 30, 255)).count, 0)
  })

  test('채널 차이 16 은 같고 17 은 다르다', () => {
    assert.equal(comparePixels(px(0, 0, 0, 255), px(16, 0, 0, 255)).count, 0)
    assert.equal(comparePixels(px(0, 0, 0, 255), px(0, 0, 17, 255)).count, 1)
  })

  test('alpha 만 다르면 같다', () => {
    assert.equal(comparePixels(px(5, 5, 5, 255), px(5, 5, 5, 0)).count, 0)
  })

  test('mask 는 다른 픽셀 위치에 1', () => {
    const { count, mask } = comparePixels(px(0, 0, 0, 255, 0, 0, 0, 255), px(0, 0, 0, 255, 99, 0, 0, 255))
    assert.equal(count, 1)
    assert.deepEqual([...mask], [0, 1])
  })
})

describe('judgeShots·pickRetakes', () => {
  test('전부 같으면 ok', () => {
    assert.deepEqual(judgeShots([r('mobile /'), r('desktop /')]), { ok: true, diffs: [] })
    assert.deepEqual(pickRetakes([r('mobile /')]), [])
  })

  test('일부 화면만 다르면 그 화면만 비율로 적고 재촬영 대상으로 고른다', () => {
    const res = [r('mobile /'), r('mobile /dashboard', { diffPx: 3293, total: 329160 })]
    assert.deepEqual(judgeShots(res), { ok: false, diffs: ['mobile /dashboard 1.00%'] })
    assert.deepEqual(pickRetakes(res), ['mobile_/dashboard.png'])
  })

  test('크기가 다르면 픽셀 비교 없이 다르다', () => {
    const res = [r('desktop /', { sizeA: '1440x3843', sizeB: '1440x3894', diffPx: null })]
    assert.deepEqual(judgeShots(res), { ok: false, diffs: ['desktop / 크기 1440x3843→1440x3894'] })
    assert.equal(pickRetakes(res).length, 1)
  })

  test('후보 이미지가 없으면(sizeB null) 다르다', () => {
    const res = [r('mobile /', { sizeB: null, diffPx: null })]
    assert.deepEqual(judgeShots(res), { ok: false, diffs: ['mobile / 크기 390x844→없음'] })
  })
})

describe('navErrorCode — measure 프리플라이트와 같은 기준', () => {
  test('200 은 정상', () => assert.equal(navErrorCode(200, false), null))
  test('리다이렉트는 환경 오류(1) — 쿠키 만료', () => assert.equal(navErrorCode(200, true), 1))
  test('404·401 은 환경 오류(1) — db reset 으로 고정 URL 이 사라짐', () => {
    assert.equal(navErrorCode(404, false), 1)
    assert.equal(navErrorCode(401, false), 1)
  })
  test('5xx 는 후보 crash(2)', () => assert.equal(navErrorCode(500, false), 2))
})
```

- [ ] **Step 4: 실패 확인**

Run: `node --test scripts/lighthouse/shots.test.mjs`
Expected: FAIL — `Cannot find module './shots.mjs'`

- [ ] **Step 5: 구현** — `shots.mjs` (순수 부분)

```js
// Lighthouse 루프의 스크린샷 관문. 후보의 최종 화면이 기준선과 픽셀 단위로 같은지 본다.
// 설계: docs/superpowers/specs/2026-10-11-lighthouse-loop-design.md "스크린샷 관문"
//
// 판정은 엄격하다 — 같은 커밋 두 번 촬영이 22장 전부 0px 이었으므로 허용치를 두지 않는다.

import { readFileSync } from 'node:fs'

import { preflightErrorCode } from './measure.mjs'

export const VIEWPORTS = {
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true },
  desktop: { width: 1440, height: 900 },
}
export const THRESHOLD = 16
export const RETAKES = 2
export const SCREENS = JSON.parse(readFileSync(new URL('./screens.json', import.meta.url), 'utf8'))

export const shotName = (viewport, p) => `${viewport}${p === '/' ? '__root' : p.replace(/\//g, '_')}.png`

export function listScreens(screens) {
  return Object.keys(VIEWPORTS).flatMap((viewport) =>
    screens.map(({ path, auth }) => ({ viewport, path, auth, name: shotName(viewport, path), label: `${viewport} ${path}` })))
}

// RGBA 버퍼 두 개에서 RGB 채널 차이가 THRESHOLD 를 넘는 픽셀을 센다. alpha 는 보지 않는다.
export function comparePixels(a, b) {
  const mask = new Uint8Array(a.length / 4)
  let count = 0
  for (let i = 0, p = 0; i < a.length; i += 4, p++) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]))
    if (d > THRESHOLD) {
      mask[p] = 1
      count++
    }
  }
  return { count, mask }
}

const differs = (r) => r.sizeA !== r.sizeB || r.diffPx > 0

export function judgeShots(results) {
  const diffs = results.filter(differs).map((r) =>
    r.sizeA !== r.sizeB
      ? `${r.label} 크기 ${r.sizeA}→${r.sizeB ?? '없음'}`
      : `${r.label} ${((r.diffPx / r.total) * 100).toFixed(2)}%`)
  return { ok: diffs.length === 0, diffs }
}

export function pickRetakes(results) {
  return results.filter(differs).map((r) => r.name)
}

// measure 프리플라이트와 같은 기준: 5xx 는 후보가 깨뜨린 것(2), 리다이렉트·그 밖은 환경 문제(1).
export function navErrorCode(status, redirected) {
  if (redirected) return 1
  if (status === 200) return null
  return preflightErrorCode(status)
}
```

- [ ] **Step 6: 통과 확인**

Run: `node --test scripts/lighthouse/*.test.mjs`
Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add scripts/lighthouse/shots.mjs scripts/lighthouse/shots.test.mjs scripts/lighthouse/screens.json package.json package-lock.json
git commit -m "feat(perf): 스크린샷 관문의 판정 함수와 촬영 대상 11개 화면"
```

---

### Task 4: shots — 촬영·비교 본체와 CLI

**Files:**
- Modify: `scripts/lighthouse/shots.mjs` (I/O 함수와 CLI 추가, import 줄 확장)

**Interfaces:**
- Consumes: `MeasureError`, `preflight`, `withServer` (`measure.mjs`, Task 2), Task 3 의 순수 함수
- Produces:
  - `capture(server, outDir, only?: string[]): Promise<void>` — `server = { baseUrl, cookies }`. 이동 실패 → `MeasureError(2)`, `navErrorCode` 결과대로 `MeasureError(1|2)`, Chrome 실행 실패 → `MeasureError(1)`
  - `compare(refDir, dir, diffDir): Promise<results>` — 기준 이미지가 없으면 `MeasureError(1)`. 다른 화면은 diff PNG(다른 픽셀 빨강)를 `diffDir` 에 남긴다
  - `captureRef(server, refDir): Promise<void>` — 연속 두 촬영이 같아야 채택. 재촬영 2회 후에도 다르면 `MeasureError(1)`
  - `captureCandidate(server, refDir, dir): Promise<{ ok, diffs }>` — `dir/shots`, `dir/diff` 에 남긴다
  - CLI: `node scripts/lighthouse/shots.mjs ref <refDir>` · `check <refDir> <dir>` (build 된 체크아웃에서)

- [ ] **Step 1: 구현** — `shots.mjs` 의 import 를 바꾸고 파일 끝에 추가

import 블록:

```js
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { MeasureError, preflight, preflightErrorCode, withServer } from './measure.mjs'
```

파일 끝:

```js
const FREEZE = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'

async function launchBrowser() {
  const { Launcher } = await import('chrome-launcher')
  const executablePath = Launcher.getInstallations()[0]
  if (!executablePath) throw new MeasureError(1, 'Chrome 을 찾지 못했다')
  const { default: puppeteer } = await import('puppeteer-core')
  try {
    return await puppeteer.launch({ executablePath, headless: true, args: ['--font-render-hinting=none', '--disable-gpu'] })
  } catch (e) {
    throw new MeasureError(1, `Chrome 실행 실패: ${e.message}`)
  }
}

export async function capture({ baseUrl, cookies }, outDir, only) {
  mkdirSync(outDir, { recursive: true })
  const domain = new URL(baseUrl).hostname
  const targets = listScreens(SCREENS).filter((s) => !only || only.includes(s.name))
  const browser = await launchBrowser()
  try {
    for (const s of targets) {
      const ctx = await browser.createBrowserContext()
      try {
        const page = await ctx.newPage()
        await page.setViewport({ ...VIEWPORTS[s.viewport], deviceScaleFactor: 1 })
        if (s.auth) await ctx.setCookie(...cookies.map(({ name, value }) => ({ name, value, domain, path: '/' })))
        let res
        try {
          res = await page.goto(baseUrl + s.path, { waitUntil: 'networkidle0', timeout: 60000 })
        } catch (e) {
          throw new MeasureError(2, `${s.label} 이동 실패: ${e.message}`)
        }
        const code = navErrorCode(res.status(), res.request().redirectChain().length > 0)
        if (code) throw new MeasureError(code, `${s.label} HTTP ${res.status()} → ${page.url()}`)
        await page.addStyleTag({ content: FREEZE })
        await page.evaluate(() => document.fonts.ready)
        await new Promise((r) => setTimeout(r, 500))
        await page.screenshot({ path: path.join(outDir, s.name), fullPage: true })
        log(`${s.label}`)
      } finally {
        await ctx.close()
      }
    }
  } finally {
    await browser.close()
  }
}

async function writeDiff(sharp, A, mask, file) {
  const { width, height } = A.info
  const img = Buffer.alloc(width * height * 4)
  for (let p = 0; p < mask.length; p++) {
    const i = p * 4
    if (mask[p]) img.set([255, 0, 0, 255], i)
    else {
      const g = Math.round(((A.data[i] + A.data[i + 1] + A.data[i + 2]) / 3) * 0.3 + 178)
      img.set([g, g, g, 255], i)
    }
  }
  await sharp(img, { raw: { width, height, channels: 4 } }).png().toFile(file)
}

export async function compare(refDir, dir, diffDir) {
  const { default: sharp } = await import('sharp')
  rmSync(diffDir, { recursive: true, force: true })
  mkdirSync(diffDir, { recursive: true })
  const read = (f) => (existsSync(f) ? sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true }) : null)
  const results = []
  for (const s of listScreens(SCREENS)) {
    const A = await read(path.join(refDir, s.name))
    if (!A) throw new MeasureError(1, `기준 이미지가 없다: ${path.join(refDir, s.name)}`)
    const B = await read(path.join(dir, s.name))
    const sizeA = `${A.info.width}x${A.info.height}`
    const sizeB = B ? `${B.info.width}x${B.info.height}` : null
    const total = A.info.width * A.info.height
    if (sizeA !== sizeB) {
      results.push({ ...s, sizeA, sizeB, diffPx: null, total })
      continue
    }
    const { count, mask } = comparePixels(A.data, B.data)
    results.push({ ...s, sizeA, sizeB, diffPx: count, total })
    if (count) await writeDiff(sharp, A, mask, path.join(diffDir, s.name))
  }
  return results
}

// 기준은 연속 두 촬영이 같아야 채택한다. 기준이 틀리면 그 실행의 모든 후보가 억울하게 탈락한다.
// CSS 없이 찍힌 촬영(99.8% diff)이 실제로 1회 관측됐다.
export async function captureRef(server, refDir) {
  const checkDir = `${refDir}-check`
  rmSync(refDir, { recursive: true, force: true })
  rmSync(checkDir, { recursive: true, force: true })
  await capture(server, refDir)
  await capture(server, checkDir)
  let results = await compare(refDir, checkDir, `${refDir}-diff`)
  for (let i = 0; i < RETAKES && !judgeShots(results).ok; i++) {
    const names = pickRetakes(results)
    // 직전 촬영을 새 기준 후보로 두고 한 번 더 찍어 맞춰 본다
    for (const n of names) copyFileSync(path.join(checkDir, n), path.join(refDir, n))
    await capture(server, checkDir, names)
    results = await compare(refDir, checkDir, `${refDir}-diff`)
  }
  const { ok, diffs } = judgeShots(results)
  if (!ok) throw new MeasureError(1, `기준 이미지가 안정되지 않는다: ${diffs.join(', ')}`)
}

export async function captureCandidate(server, refDir, dir) {
  const shotDir = path.join(dir, 'shots')
  const diffDir = path.join(dir, 'diff')
  rmSync(shotDir, { recursive: true, force: true })
  await capture(server, shotDir)
  let results = await compare(refDir, shotDir, diffDir)
  for (let i = 0; i < RETAKES && !judgeShots(results).ok; i++) {
    await capture(server, shotDir, pickRetakes(results))
    results = await compare(refDir, shotDir, diffDir)
  }
  return judgeShots(results)
}

function log(msg) {
  process.stderr.write(`[shots] ${msg}\n`)
}

// 사람이 기준 이미지를 확인하거나 관문만 따로 돌릴 때. build 된 체크아웃에서 실행한다.
//   node scripts/lighthouse/shots.mjs ref <refDir>
//   node scripts/lighthouse/shots.mjs check <refDir> <dir>
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, refDir, dir] = process.argv.slice(2)
  const cwd = process.cwd()
  try {
    await preflight(cwd)
    if (cmd === 'ref') {
      await withServer(cwd, (server) => captureRef(server, refDir))
      log(`기준 이미지 확정: ${refDir}`)
    } else if (cmd === 'check') {
      const r = await withServer(cwd, (server) => captureCandidate(server, refDir, dir))
      log(r.ok ? '통과 — 기준과 같다' : `다름: ${r.diffs.join(', ')}`)
      process.exitCode = r.ok ? 0 : 3
    } else {
      log('사용법: shots.mjs ref <refDir> | check <refDir> <dir>')
      process.exitCode = 64
    }
  } catch (e) {
    log(e.message)
    process.exitCode = e instanceof MeasureError ? e.code : 1
  }
}
```

- [ ] **Step 2: 단위 테스트가 여전히 통과하는지**

Run: `node --test scripts/lighthouse/*.test.mjs`
Expected: 전부 PASS (`shots.mjs` 를 import 해도 puppeteer·sharp 는 동적 import 라 로드되지 않는다)

- [ ] **Step 3: 기준 이미지 실측** — 현재 HEAD(Pretendard 적용)를 build 하고 기준을 찍는다

Run (Bash timeout 600000): `cd ~/.cache/finsight-lighthouse/bench && npm run build >/dev/null 2>&1 && node scripts/lighthouse/shots.mjs ref .local/lighthouse/shots/task4/ref; echo exit=$?; ls .local/lighthouse/shots/task4/ref | wc -l; lsof -tiTCP:3100 -sTCP:LISTEN || echo port-free`
Expected: `기준 이미지 확정`, `exit=0`, `22`, `port-free`

- [ ] **Step 4: 같은 build 는 통과**

Run (Bash timeout 600000): `cd ~/.cache/finsight-lighthouse/bench && node scripts/lighthouse/shots.mjs check .local/lighthouse/shots/task4/ref .local/lighthouse/shots/task4/same; echo exit=$?`
Expected: `통과 — 기준과 같다`, `exit=0`

- [ ] **Step 5: 글꼴을 되돌린 build 는 탈락** — 작업 트리만 잠시 바꾸고 반드시 되돌린다

Run (Bash timeout 600000):
```bash
cd ~/.cache/finsight-lighthouse/bench && sed -i '' 's/--font-core: var(--font-pretendard), /--font-core: /' src/app/globals.css \
  && npm run build >/dev/null 2>&1 && node scripts/lighthouse/shots.mjs check .local/lighthouse/shots/task4/ref .local/lighthouse/shots/task4/sysfont; echo exit=$?; \
  git checkout src/app/globals.css && git status --short
```
Expected: `다름: mobile / …%, …` (대부분 화면), `exit=3`, 마지막 `git status --short` 출력 없음. `.local/lighthouse/shots/task4/sysfont/diff/` 에 빨간 diff PNG

- [ ] **Step 6: 육안 확인** — `Read` 로 `.local/lighthouse/shots/task4/ref/mobile__root.png`, `desktop_dashboard.png` 를 열어 Pretendard 로 찍혔고 CSS 가 적용됐는지 본다. 하나라도 이상하면 멈추고 보고한다

- [ ] **Step 7: 원래 build 로 복구 후 커밋**

```bash
npm run build >/dev/null 2>&1
git add scripts/lighthouse/shots.mjs
git commit -m "feat(perf): 22장을 찍어 기준과 비교하는 스크린샷 관문 본체와 CLI"
```

---

### Task 5: round — 관문 연결과 tsc 순서 수정

**Files:**
- Modify: `scripts/lighthouse/round.mjs` (`baseline()`·`evaluate()` 교체, 헬퍼 2개 추가, `rmSync` import 제거)
- Test: `scripts/lighthouse/round.test.mjs`
- Modify: `scripts/lighthouse/program.md`

**Interfaces:**
- Consumes: `preflight`, `build`, `withServer`, `lighthouse`, `MeasureError` (Task 2), `captureRef`, `captureCandidate` (Task 4)
- Produces:
  - `visualReason(diffs: string[]) → string` — 앞 3개 + ` 외 N장`
  - `missingRef(best, exists: (p) => boolean) → string | null`
  - `seoulDate(now: Date) → 'YYYY-MM-DD'` (Asia/Seoul)
  - `best.json` 에 `refDir`·`refDate` 필드. evaluate 결과 status 에 `visual` 추가(워크플로는 결과를 그대로 전달하므로 변경 없음)

- [ ] **Step 1: 실패하는 테스트 작성** — `round.test.mjs` import 줄을 바꾸고 describe 2개 추가

```js
import { classifyCandidate, encodeCandidates, decodeCandidates, visualReason, missingRef, seoulDate } from './round.mjs'
```

```js
describe('visualReason', () => {
  test('3개 이하면 그대로', () => {
    assert.equal(visualReason(['mobile / 1.00%', 'desktop / 2.00%']), 'visual mobile / 1.00%, desktop / 2.00%')
  })

  test('22장이 다 달라도 앞 3개와 남은 장 수만 — results.tsv 한 칸이 수천 자가 되지 않게', () => {
    const diffs = Array.from({ length: 22 }, (_, i) => `s${i} 1.00%`)
    assert.equal(visualReason(diffs), 'visual s0 1.00%, s1 1.00%, s2 1.00% 외 19장')
  })
})

describe('missingRef', () => {
  test('refDir·refDate 가 없으면(이전 버전 best.json) 이유를 돌려준다', () => {
    assert.match(missingRef({ commit: 'c' }, () => true), /baseline/)
    assert.match(missingRef({ refDir: 'x' }, () => true), /baseline/)
  })

  test('디렉터리가 지워졌으면 이유를 돌려준다', () => {
    assert.match(missingRef({ refDir: 'x', refDate: '2026-10-11' }, () => false), /x/)
  })

  test('있으면 null', () => {
    assert.equal(missingRef({ refDir: 'x', refDate: '2026-10-11' }, () => true), null)
  })
})

describe('seoulDate — 화면의 일자는 서버가 서울 날짜로 계산한다', () => {
  test('UTC 14:59:59 는 아직 서울 같은 날, 15:00 부터 다음 날', () => {
    assert.equal(seoulDate(new Date('2026-10-11T14:59:59Z')), '2026-10-11')
    assert.equal(seoulDate(new Date('2026-10-11T15:00:00Z')), '2026-10-12')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `node --test scripts/lighthouse/round.test.mjs`
Expected: FAIL — `visualReason`·`seoulDate` export 없음 SyntaxError

- [ ] **Step 3: 구현** — `round.mjs`

(a) import 줄에서 `rmSync` 를 뺀다:

```js
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, appendFileSync } from 'node:fs'
```

(b) `decodeCandidates` 아래에 헬퍼 추가:

```js
export function visualReason(diffs) {
  const head = diffs.slice(0, 3).join(', ')
  return `visual ${head}${diffs.length > 3 ? ` 외 ${diffs.length - 3}장` : ''}`
}

// 기준 이미지 없이 evaluate 하면 관문이 비교할 대상이 없다. 건너뛰지 말고 멈춘다.
export function missingRef(best, exists) {
  if (!best.refDir || !best.refDate) return 'best.json 에 refDir·refDate 가 없다 — 이번 run 의 baseline 부터 다시 돌려라'
  if (!exists(best.refDir)) return `기준 이미지 디렉터리가 없다: ${best.refDir}`
  return null
}

// 대시보드 일자·체험 잔여일은 서버(next start)가 서울 날짜로 계산한다. 브라우저 시계를 고정해도
// 소용없으므로, 기준선과 날짜가 달라지면 후보 탓이 아니라 환경 변화로 보고 멈춘다.
export function seoulDate(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(now)
}

const shotsDir = (runNo, sub) => path.join(STATE_DIR, 'shots', `run${runNo}`, sub)
```

(c) `baseline()` 의 앞부분을 바꾼다 (`const measurement = await measure(process.cwd())` 까지, 그리고 `best` 생성 줄):

```js
async function baseline(runNo) {
  const { preflight, build, withServer, lighthouse } = await import('./measure.mjs')
  const { captureRef } = await import('./shots.mjs')
  assertCleanLoopBranch()
  // 같은 번호면 후보 브랜치 이름이 겹쳐 라운드 전체가 scope 로 탈락한다
  if (readHistory().some((h) => h.run === runNo)) throw new Error(`run ${runNo} 은 이미 있다 — 다음 번호를 써라`)
  const cwd = process.cwd()
  const refDir = shotsDir(runNo, 'ref')
  const refDate = seoulDate(new Date())
  await preflight(cwd)
  build(cwd)
  // 촬영을 먼저 한다 — 기준이 안정되지 않으면 측정할 이유가 없다
  const measurement = await withServer(cwd, async (server) => {
    await captureRef(server, refDir)
    return lighthouse(server)
  })
```

그 아래 기존 `appendFileSync(TSV, …)`·`commitTsv(…)` 는 그대로 두고, `best` 줄만:

```js
  const best = { commit, measurement, refDir, refDate }
```

(d) `evaluate()` 위에 후보 검사 함수를 추가한다:

```js
// 검사 순서: lint → build → tsc → vitest → 촬영 → Lighthouse.
// tsc 는 build 가 만든 현재 후보의 .next/types 를 봐야 한다. 처음엔 build 전에 tsc 를 돌리며
// .next/types 를 지웠는데, 코드가 직전과 같으면 webpack 캐시가 타입 파일을 다시 만들지 않아
// 멀쩡한 후보가 `.next/types/... not found` 로 crash 할 수 있었다.
async function inspect(m, shots, best, dir) {
  const cwd = process.cwd()
  if (!run('npm', ['run', 'lint'])) return { status: 'crash', reason: 'lint 실패' }
  try {
    await m.preflight(cwd)
    m.build(cwd)
    // next.config.ts 의 ignoreBuildErrors 로 build 의 타입 검사를 끌 수 있으므로 따로 돌린다
    if (!run('npx', ['tsc', '--noEmit'])) return { status: 'crash', reason: 'tsc 실패' }
    if (!run('npx', ['vitest', 'run'])) return { status: 'crash', reason: 'vitest 실패' }
    return await m.withServer(cwd, async (server) => {
      const today = seoulDate(new Date())
      if (today !== best.refDate) throw new Error(`서울 날짜가 기준선(${best.refDate})과 다르다(${today}) — 화면의 일자가 바뀌므로 새 run 으로 다시 시작하라`)
      const v = await shots.captureCandidate(server, best.refDir, dir)
      if (!v.ok) return { status: 'visual', reason: visualReason(v.diffs) } // 화면이 바뀌면 측정하지 않는다
      return { status: 'measured', measurement: await m.lighthouse(server) }
    })
  } catch (e) {
    if (e instanceof m.MeasureError && e.code === 2) return { status: 'crash', reason: e.message }
    throw e // 환경 오류는 후보 탓이 아니다 — 라운드 전체를 멈춘다
  }
}
```

(e) `evaluate()` 의 시작과 후보 루프 안쪽을 바꾼다:

```js
async function evaluate(runNo, roundNo, candidates) {
  const m = await import('./measure.mjs')
  const shots = await import('./shots.mjs')
  assertCleanLoopBranch()
  const best = JSON.parse(readFileSync(BEST, 'utf8'))
  if (git('rev-parse', 'HEAD') !== best.commit) throw new Error('HEAD 가 best.json 의 커밋과 다르다')
  const noRef = missingRef(best, existsSync)
  if (noRef) throw new Error(noRef)

  const judged = []
  try {
    for (const c of candidates) {
      const exists = gitOk('rev-parse', '--verify', '--quiet', `${c.branch}^{commit}`)
      const isDescendant = exists && gitOk('merge-base', '--is-ancestor', best.commit, c.branch)
      const changed = isDescendant ? git('diff', '--name-only', '--no-renames', best.commit, c.branch).split('\n').filter(Boolean) : []
      const cls = classifyCandidate({ exists, isDescendant, changed })
      if (cls.status !== 'measure') {
        judged.push({ ...c, ...cls })
        continue
      }

      log(`${c.id} ${c.auditId} — lint·build·tsc·vitest·촬영·측정`)
      git('checkout', '-q', '--detach', c.branch)
      judged.push({ ...c, ...(await inspect(m, shots, best, shotsDir(runNo, `r${roundNo}-${c.id}`))) })
      git('checkout', '-q', LOOP_BRANCH)
    }
  } finally {
    git('checkout', '-q', LOOP_BRANCH)
  }
```

나머지(`decide` 이후)는 그대로다. `next = { commit: …, measurement: w.measurement }` 는 `{ ...best, commit: …, measurement: w.measurement }` 로 바꿔 `refDir` 를 이어받게 한다:

```js
    next = { ...best, commit: git('rev-parse', 'HEAD'), measurement: w.measurement }
```

- [ ] **Step 4: 통과 확인**

Run: `node --test scripts/lighthouse/*.test.mjs && grep -n "rmSync\|\.next/types'" scripts/lighthouse/round.mjs; node --check scripts/lighthouse/round.mjs && echo ok`
Expected: 전부 PASS, grep 출력 없음, `ok`

- [ ] **Step 5: `program.md` 갱신**

"지킬 것" 목록의 `- 화면에 보이는 내용과 동작을 바꾸지 않는다. …` 줄 바로 아래에 추가:

```markdown
- **최종 화면이 기준과 픽셀 단위로 같아야 keep 된다.** 11개 화면 × 모바일·데스크톱 22장을 찍어 비교하고,
  한 장이라도 다르면 점수와 무관하게 `visual` 로 탈락한다. 글꼴(subset·weight 포함)·레이아웃·색·내용을
  바꾸는 최적화는 안 된다. 폰트는 로딩 방식(`preload`·`font-display`·포맷)만 바꿀 수 있다
```

"매 실행" 의 1번과 2번 사이에 추가:

```markdown
1-1. 루프 브랜치 HEAD 의 화면을 미리 본다 — 관문의 기준 이미지가 이 화면이 된다. 기준이 틀리면 그 실행의 판정 전체가 틀어진다:
   `npm run build && node scripts/lighthouse/shots.mjs ref .local/lighthouse/shots/preview` 후
   `.local/lighthouse/shots/preview/` 의 몇 장(`mobile__root.png`, `desktop_dashboard.png`)을 연다.
   같은 커밋이면 루프가 찍는 기준과 픽셀 단위로 같다
```

"매 실행" 4번(`끝나면 results.tsv 와 …`) 끝에 추가:

```markdown
   `visual` 줄은 화면이 기준과 달랐다는 뜻이다. 다른 픽셀을 빨갛게 칠한 이미지가
   `.local/lighthouse/shots/run<N>/r<R>-<후보>/diff/` 에, 후보 화면이 같은 디렉터리의 `shots/` 에,
   기준이 `.local/lighthouse/shots/run<N>/ref/` 에 있다. "서울 날짜가 기준선과 다르다" 로 멈췄다면
   자정을 넘긴 것이다 — 다음 번호로 다시 실행한다
```

"동적 URL 을 다시 넣을 때 …" 문단의 `pages.json` 언급 두 곳을 `pages.json`·`screens.json` 으로 바꾼다(촬영 대상은 11개 전부라 `screens.json` 이 항상 동적 URL 을 갖는다).

- [ ] **Step 6: 커밋**

```bash
git add scripts/lighthouse/round.mjs scripts/lighthouse/round.test.mjs scripts/lighthouse/program.md
git commit -m "feat(perf): 루프가 촬영으로 화면 변화를 탈락시키고 tsc 를 build 뒤에 돌린다"
```

---

### Task 6: 관문 실측 — 가짜 후보 2개로 run 2 라운드 1

이 실측은 `results.tsv` 에 run 2 기준선(Pretendard 적용 후 진짜 출발점)과 가짜 후보 2줄을 남긴다. 가짜 후보의 auditId 는 `gate-test-*` 라 다음 실행의 가설 선택에 영향을 주지 않는다. 다음 정식 실행은 run 3 이다.

**Files:**
- 코드 변경 없음. `results.tsv`·`.local/lighthouse/` 가 round.mjs 에 의해 갱신된다

**Interfaces:**
- Consumes: Task 1~5 전부

- [ ] **Step 1: 전체 검사** — 루프가 후보마다 돌리는 것과 같은 검사를 루프 브랜치에서

Run (Bash timeout 600000): `cd ~/.cache/finsight-lighthouse/bench && node --test scripts/lighthouse/*.test.mjs && npx vitest run .claude/workflows/lighthouse-loop.test.js && npm run lint && npm run build >/dev/null && npx tsc --noEmit && echo ALL-OK`
Expected: `ALL-OK`

- [ ] **Step 2: run 2 기준선** (로컬 Supabase 실행 중, 포트 3100 비어 있음, `git status` 깨끗)

Run: `cd ~/.cache/finsight-lighthouse/bench && rm -f .local/lighthouse/run2-base.json && nohup node scripts/lighthouse/round.mjs baseline --run 2 --out .local/lighthouse/run2-base.json > .local/lighthouse/run2-base.json.log 2>&1 &`
그다음 같은 턴 안에서 반복 (Bash timeout 600000): `cd ~/.cache/finsight-lighthouse/bench && node scripts/lighthouse/round.mjs wait --out .local/lighthouse/run2-base.json --max 540`
Expected: `{"ok":true,"bestCommit":…,"bestPerf":…,…}` — `bestPerf` 가 70~85 근처(Pretendard 적용 후 11개 평균이 78.09 였다. 3개 평균이라 조금 다를 수 있다. 90 이상이면 글꼴이 빠진 것이니 멈추고 보고), `.local/lighthouse/shots/run2/ref/` 에 22장, `.local/lighthouse/best.json` 에 `refDir`·`refDate`. `.local/lighthouse/run2-base.json.log` 에 `[measure] / 1/3` 류 줄이 있다(measure 분리 후 Lighthouse 경로 확인)

- [ ] **Step 3: 가짜 후보 브랜치 만들기** — 벤치는 루프 브랜치에 머물러야 하므로 임시 worktree 에서

```bash
cd ~/.cache/finsight-lighthouse/bench
BASE=$(node -p "require('./.local/lighthouse/best.json').commit")
T=$(mktemp -d)/gate
git worktree add -q -b perf/cand/run2-r1-a "$T" "$BASE"
sed -i '' 's/--font-core: var(--font-pretendard), /--font-core: /' "$T/src/app/globals.css"
git -C "$T" commit -qam "test(perf): 관문 실측 — 시스템 폰트로 되돌린 가짜 후보"
git worktree remove "$T"
git worktree add -q -b perf/cand/run2-r1-b "$T" "$BASE"
printf '\n// 관문 실측: 화면을 바꾸지 않는 변경\n' >> "$T/src/app/(app)/dashboard/page.tsx"
git -C "$T" commit -qam "test(perf): 관문 실측 — 주석만 바꾼 가짜 후보"
git worktree remove "$T"
git log --oneline -1 perf/cand/run2-r1-a; git log --oneline -1 perf/cand/run2-r1-b; git status --short
```
Expected: 두 브랜치에 커밋 1개씩, `git status --short` 출력 없음

- [ ] **Step 4: 라운드 실행**

```bash
cd ~/.cache/finsight-lighthouse/bench
C=$(node --input-type=module -e "import { encodeCandidates } from './scripts/lighthouse/round.mjs'; process.stdout.write(encodeCandidates([
  { id: 'A', auditId: 'gate-test-sysfont', branch: 'perf/cand/run2-r1-a', description: '관문 실측: 시스템 폰트' },
  { id: 'B', auditId: 'gate-test-comment', branch: 'perf/cand/run2-r1-b', description: '관문 실측: 주석만' }]))")
rm -f .local/lighthouse/run2-r1.json && nohup node scripts/lighthouse/round.mjs evaluate --run 2 --round 1 --candidates "$C" --out .local/lighthouse/run2-r1.json > .local/lighthouse/run2-r1.json.log 2>&1 &
```
그다음 같은 턴 안에서 반복 (Bash timeout 600000): `cd ~/.cache/finsight-lighthouse/bench && node scripts/lighthouse/round.mjs wait --out .local/lighthouse/run2-r1.json --max 540`

Expected:
- A: `status: "visual"`, reason 이 `visual mobile / …%, … 외 N장`, `perfAvg: null` — Lighthouse 를 돌지 않았다(로그에 A 의 `[measure] / 1/3` 줄이 없다)
- B: `visual` 이 아님 — `discard`(gain < 1) 또는 `keep`. `.local/lighthouse/shots/run2/r1-B/diff/` 가 비어 있다
- `tail -3 scripts/lighthouse/results.tsv` 에 run 2 의 base·A·B 줄, `git status --short` 출력 없음, 포트 3100 비어 있음

- [ ] **Step 5: 결과 확인 후 보고** — B 가 우연히 keep 되면 주석 한 줄 커밋이 루프 브랜치에 들어간다. 해롭지 않지만 PR 로 옮길 때 고르지 않는다고 보고에 적는다. A 의 diff 이미지 1장(`.local/lighthouse/shots/run2/r1-A/diff/desktop__root.png`)을 `Read` 로 열어 글자 영역이 빨갛게 표시됐는지 본다

- [ ] **Step 6: 후보 브랜치 정리**

```bash
git branch -D perf/cand/run2-r1-a perf/cand/run2-r1-b
```
