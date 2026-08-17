// tdd_guard_adapter 테스트 — node --test scripts/hooks/
//
// 판정 규칙 자체는 vendor/tdd-rules.mjs 의 책임이다. 여기서 검증하는 것은
// **어댑터의 몫** — apply_patch 의 patch 텍스트에서 대상 경로를 뽑아내고,
// 상대 경로를 cwd 로 절대화하고, 판정 불능일 때 통과시키는 부분이다.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import { targetsOf, evaluate } from './tdd_guard_adapter.mjs'

const CWD = '/repo'

function patch(...lines) {
  return ['*** Begin Patch', ...lines, '*** End Patch', ''].join('\n')
}

function applyPatchInput(patchText) {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: 'apply_patch',
    cwd: CWD,
    tool_input: { command: patchText },
  }
}

// 주어진 절대 경로들만 존재하는 가짜 파일시스템
const fsWith = (...paths) => ({ exists: (p) => paths.includes(p) })

// ---------------------------------------------------------------------------
// targetsOf — patch 텍스트에서 대상 경로 추출
// ---------------------------------------------------------------------------

describe('targetsOf', () => {
  test('Add File 을 잡는다', () => {
    assert.deepEqual(targetsOf(patch('*** Add File: src/auth.ts', '+export const x = 1')), [
      'src/auth.ts',
    ])
  })

  test('Update File 을 잡는다', () => {
    assert.deepEqual(targetsOf(patch('*** Update File: src/auth.ts', '+x')), ['src/auth.ts'])
  })

  test('여러 파일을 모두 잡는다', () => {
    const p = patch('*** Add File: src/a.ts', '+a', '*** Update File: src/b.ts', '+b')
    assert.deepEqual(targetsOf(p), ['src/a.ts', 'src/b.ts'])
  })

  test('Delete File 은 무시한다 — 삭제에 테스트를 요구할 이유가 없다', () => {
    assert.deepEqual(targetsOf(patch('*** Delete File: src/old.ts')), [])
  })

  test('덮어쓰기(Delete + Add)는 Add 쪽만 남는다', () => {
    const p = patch('*** Delete File: README.md', '*** Add File: README.md', '+goodbye')
    assert.deepEqual(targetsOf(p), ['README.md'])
  })

  test('patch 가 아니면 빈 배열', () => {
    assert.deepEqual(targetsOf('echo hello'), [])
  })
})

// ---------------------------------------------------------------------------
// evaluate — 판정
// ---------------------------------------------------------------------------

describe('evaluate', () => {
  test('테스트가 없는 구현 파일을 막는다', () => {
    const input = applyPatchInput(patch('*** Add File: src/auth.ts', '+export const x = 1'))
    const verdict = evaluate(input, fsWith())
    assert.equal(verdict?.decision, 'deny')
    assert.match(verdict.reason, /auth\.ts/)
  })

  test('테스트가 있으면 통과시킨다', () => {
    const input = applyPatchInput(patch('*** Add File: src/auth.ts', '+export const x = 1'))
    assert.equal(evaluate(input, fsWith('/repo/src/auth.test.ts')), null)
  })

  test('상대 경로를 cwd 기준으로 절대화한다', () => {
    // 절대화하지 않으면 판정 로직이 엉뚱한 곳에서 테스트를 찾는다.
    // 패키지 루트를 찾느라 cwd 밖(조상 디렉터리)도 조회하므로, 확인할 것은
    // "전부 절대 경로인가" 와 "테스트 후보가 cwd 기준으로 잡혔는가" 두 가지다.
    const input = applyPatchInput(patch('*** Add File: src/auth.ts', '+x'))
    const seen = []
    evaluate(input, { exists: (p) => (seen.push(p), false) })

    const relative = seen.filter((p) => !path.isAbsolute(p))
    assert.deepEqual(relative, [], `절대 경로가 아닌 조회: ${relative.join(', ')}`)
    assert.ok(
      seen.includes('/repo/src/auth.test.ts'),
      'cwd 기준 테스트 후보를 찾지 않았다'
    )
  })

  test('테스트 파일 자체를 쓰는 것은 막지 않는다', () => {
    const input = applyPatchInput(patch('*** Add File: src/auth.test.ts', '+test()'))
    assert.equal(evaluate(input, fsWith()), null)
  })

  test('한 파일이라도 걸리면 패치 전체를 막는다', () => {
    const p = patch('*** Add File: src/ok.ts', '+a', '*** Add File: src/bad.ts', '+b')
    const verdict = evaluate(applyPatchInput(p), fsWith('/repo/src/ok.test.ts'))
    assert.equal(verdict?.decision, 'deny')
    assert.match(verdict.reason, /bad\.ts/)
  })

  // --- fail-open: 판정 불능이면 통과 ---

  test('apply_patch 가 아닌 도구는 건드리지 않는다', () => {
    const input = { tool_name: 'Bash', cwd: CWD, tool_input: { command: 'rm -rf /' } }
    assert.equal(evaluate(input, fsWith()), null)
  })

  test('tool_input 이 없어도 통과시킨다', () => {
    assert.equal(evaluate({ tool_name: 'apply_patch', cwd: CWD }, fsWith()), null)
  })

  test('cwd 가 없어도 통과시킨다', () => {
    // 절대화할 기준이 없으면 판정이 불가능하다. 추측해서 막지 않는다.
    const input = {
      tool_name: 'apply_patch',
      tool_input: { command: patch('*** Add File: a.ts', '+x') },
    }
    assert.equal(evaluate(input, fsWith()), null)
  })

  test('지원하지 않는 언어는 통과시킨다', () => {
    const input = applyPatchInput(patch('*** Add File: main.go', '+package main'))
    assert.equal(evaluate(input, fsWith()), null)
  })
})
