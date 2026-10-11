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
