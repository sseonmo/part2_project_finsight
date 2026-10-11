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
const BASE = `http://localhost:${PORT}`
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

// 5xx 는 후보가 페이지를 런타임에 깨뜨린 것이라 crash(2). 리다이렉트·401·404 는 환경 문제(1).
export function preflightErrorCode(status) {
  return status >= 500 ? 2 : 1
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  measure(process.cwd()).then(
    (m) => process.stdout.write(JSON.stringify(m) + '\n'),
    (e) => {
      log(e.message)
      process.exit(e instanceof MeasureError ? e.code : 1)
    },
  )
}
