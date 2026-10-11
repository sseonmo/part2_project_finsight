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
