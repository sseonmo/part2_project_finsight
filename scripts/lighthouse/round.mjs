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

// 관문이 다르다고 하면 날짜를 다시 본다. 촬영 직전 확인을 통과한 뒤 22장과 재촬영 사이에 자정을
// 넘기면 화면이 바뀌어 다르게 나오는데, 그건 후보 탓이 아니다.
export function gateResult(v, refDate, today) {
  if (v.ok) return null
  if (today !== refDate) throw new Error(`서울 날짜가 기준선(${refDate})과 다르다(${today}) — 화면의 일자가 바뀌므로 새 run 으로 다시 시작하라`)
  return { status: 'visual', reason: visualReason(v.diffs) }
}

const shotsDir = (runNo, sub) => path.join(STATE_DIR, 'shots', `run${runNo}`, sub)

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
  appendFileSync(TSV, formatRow({
    run: runNo, round: 0, candidate: 'base', auditId: '-', perfAvg: measurement.perfAvg,
    minGuard: minGuard(measurement), status: 'baseline', commit: git('rev-parse', '--short', 'HEAD'), description: `run ${runNo} 기준선`,
  }) + '\n')
  const commit = commitTsv(`chore(perf): run ${runNo} 기준선 ${measurement.perfAvg}`)
  const best = { commit, measurement, refDir, refDate }
  writeFileSync(BEST, JSON.stringify(best))
  return nextState(best)
}

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
      const rejected = gateResult(v, best.refDate, seoulDate(new Date()))
      if (rejected) return rejected // 화면이 바뀌면 측정하지 않는다
      return { status: 'measured', measurement: await m.lighthouse(server) }
    })
  } catch (e) {
    if (e instanceof m.MeasureError && e.code === 2) return { status: 'crash', reason: e.message }
    throw e // 환경 오류는 후보 탓이 아니다 — 라운드 전체를 멈춘다
  }
}

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

  const decision = decide(best, judged)
  let next = best
  if (decision.winner) {
    const w = judged.find((c) => c.id === decision.winner)
    git('merge', '-q', '--ff-only', w.branch)
    next = { ...best, commit: git('rev-parse', 'HEAD'), measurement: w.measurement }
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
