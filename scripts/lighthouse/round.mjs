// Lighthouse 루프의 한 단계를 결정론적으로 수행한다. 벤치 worktree 에서 실행한다.
//
//   node scripts/lighthouse/round.mjs baseline --run 1 --out .local/lighthouse/run1-base.json
//   node scripts/lighthouse/round.mjs evaluate --run 1 --round 1 --candidates <encoded> --out ...
//   node scripts/lighthouse/round.mjs wait --out ... [--max 540]
//
// 측정 하나가 10분을 넘으므로 에이전트는 nohup 으로 띄우고 wait 로 기다린다.
// 결과는 --out 에 원자적으로(임시 파일 → rename) 쓴다.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, readFileSync, renameSync, writeFileSync, appendFileSync } from 'node:fs'
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
      const changed = isDescendant ? git('diff', '--name-only', '--no-renames', best.commit, c.branch).split('\n').filter(Boolean) : []
      const cls = classifyCandidate({ exists, isDescendant, changed })
      if (cls.status !== 'measure') {
        judged.push({ ...c, ...cls })
        continue
      }

      log(`${c.id} ${c.auditId} — lint·tsc·vitest·측정`)
      git('checkout', '-q', '--detach', c.branch)
      // tsconfig 가 .next/types 를 포함하는데 tsc 는 build 전에 돌아 이전 후보의 타입을 본다
      rmSync('.next/types', { recursive: true, force: true })
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
