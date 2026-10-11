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
