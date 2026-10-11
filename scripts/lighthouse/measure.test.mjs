// measure 의 순수 헬퍼 테스트 — node --test scripts/lighthouse/*.test.mjs
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
