// Lighthouse 루프의 스크린샷 관문. 후보의 최종 화면이 기준선과 픽셀 단위로 같은지 본다.
// 설계: docs/superpowers/specs/2026-10-11-lighthouse-loop-design.md "스크린샷 관문"
//
// 판정은 엄격하다 — 같은 커밋 두 번 촬영이 22장 전부 0px 이었으므로 허용치를 두지 않는다.

import { readFileSync } from 'node:fs'

import { preflightErrorCode } from './measure.mjs'

export const VIEWPORTS = {
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true },
  desktop: { width: 1440, height: 900 },
}
export const THRESHOLD = 16
export const RETAKES = 2
export const SCREENS = JSON.parse(readFileSync(new URL('./screens.json', import.meta.url), 'utf8'))

export const shotName = (viewport, p) => `${viewport}${p === '/' ? '__root' : p.replace(/\//g, '_')}.png`

export function listScreens(screens) {
  return Object.keys(VIEWPORTS).flatMap((viewport) =>
    screens.map(({ path, auth }) => ({ viewport, path, auth, name: shotName(viewport, path), label: `${viewport} ${path}` })))
}

// RGBA 버퍼 두 개에서 RGB 채널 차이가 THRESHOLD 를 넘는 픽셀을 센다. alpha 는 보지 않는다.
export function comparePixels(a, b) {
  const mask = new Uint8Array(a.length / 4)
  let count = 0
  for (let i = 0, p = 0; i < a.length; i += 4, p++) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]))
    if (d > THRESHOLD) {
      mask[p] = 1
      count++
    }
  }
  return { count, mask }
}

const differs = (r) => r.sizeA !== r.sizeB || r.diffPx > 0

export function judgeShots(results) {
  const diffs = results.filter(differs).map((r) =>
    r.sizeA !== r.sizeB
      ? `${r.label} 크기 ${r.sizeA}→${r.sizeB ?? '없음'}`
      : `${r.label} ${((r.diffPx / r.total) * 100).toFixed(2)}%`)
  return { ok: diffs.length === 0, diffs }
}

export function pickRetakes(results) {
  return results.filter(differs).map((r) => r.name)
}

// measure 프리플라이트와 같은 기준: 5xx 는 후보가 깨뜨린 것(2), 리다이렉트·그 밖은 환경 문제(1).
export function navErrorCode(status, redirected) {
  if (redirected) return 1
  if (status === 200) return null
  return preflightErrorCode(status)
}
