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

// 표시용. 판정은 반올림 전 차이로 한다.
const round2 = (n) => Math.round(n * 100) / 100

export function decide(best, candidates) {
  const bestPerf = best.measurement.perfAvg
  const results = candidates.map((c) => {
    const base = { id: c.id, auditId: c.auditId, branch: c.branch, description: c.description }
    if (c.status === 'nochange') return { ...base, status: 'discard', perfAvg: null, reason: c.reason }
    if (c.status !== 'measured') return { ...base, status: c.status, perfAvg: null, reason: c.reason }

    const perfAvg = c.measurement.perfAvg
    const drops = guardDrops(best.measurement, c.measurement)
    if (drops.length) return { ...base, status: 'discard', perfAvg, reason: 'guard ' + drops.join(', ') }

    const diff = perfAvg - bestPerf
    const gain = round2(diff)
    if (diff < THRESHOLDS.MIN_GAIN - 1e-9) return { ...base, status: 'discard', perfAvg, reason: `gain +${gain} < ${THRESHOLDS.MIN_GAIN}` }
    return { ...base, status: 'eligible', perfAvg, reason: `gain +${gain}` }
  })

  const eligible = results.filter((r) => r.status === 'eligible')
  const winner = eligible.reduce((w, r) => (w && w.perfAvg >= r.perfAvg ? w : r), null)
  for (const r of eligible) {
    if (r === winner) r.status = 'keep'
    else Object.assign(r, { status: 'outcompeted', reason: `${r.reason}, ${winner.id} 에 밀림` })
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
