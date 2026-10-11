// judge 테스트 — node --test scripts/lighthouse/*.test.mjs
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

  test('+0.95 는 반올림되어 keep 되지 않는다', () => {
    const r = decide(best, [cand('A', m(60.95))])
    assert.equal(r.winner, null)
    assert.equal(r.results[0].status, 'discard')
    assert.match(r.results[0].reason, /\+0\.95/)
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
