// round 의 순수 헬퍼 테스트 — node --test scripts/lighthouse/*.test.mjs
//
// git·측정을 실제로 엮는 부분은 Task 6 의 1회 실행으로 확인한다.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { classifyCandidate, encodeCandidates, decodeCandidates, visualReason, missingRef, seoulDate, gateResult, nextRun } from './round.mjs'

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

describe('gateResult — 관문이 다르다고 할 때 날짜를 다시 본다', () => {
  test('같으면 null — 측정으로 넘어간다', () => {
    assert.equal(gateResult({ ok: true, diffs: [] }, '2026-10-11', '2026-10-11'), null)
  })

  test('다르고 날짜가 같으면 visual', () => {
    assert.deepEqual(gateResult({ ok: false, diffs: ['mobile / 1.00%'] }, '2026-10-11', '2026-10-11'), { status: 'visual', reason: 'visual mobile / 1.00%' })
  })

  test('촬영 도중 자정을 넘겨 달라졌으면 후보 visual 이 아니라 환경 오류로 던진다', () => {
    assert.throws(() => gateResult({ ok: false, diffs: ['mobile /dashboard 4.00%'] }, '2026-10-11', '2026-10-12'), /서울 날짜/)
  })
})

describe('nextRun — 사람이 회차를 기억하지 않게 이력에서 다음 번호를 정한다', () => {
  test('이력이 없으면 1', () => assert.equal(nextRun([]), 1))
  test('가장 큰 run + 1 — 순서와 무관', () => {
    assert.equal(nextRun([{ run: 2 }, { run: 1 }, { run: 2 }]), 3)
  })
})
