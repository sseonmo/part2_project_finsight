#!/usr/bin/env node
// Codex PreToolUse hook — 테스트 없이 구현 코드를 쓰려 하면 차단한다.
//
// team-tdd-kit(Claude 판)은 `tool_input.file_path` 를 읽는다. Codex 의 `apply_patch` 는
// 그 필드를 주지 않고 patch 텍스트 전체를 `tool_input.command` 로 준다. 그대로 옮기면
// 경로를 못 찾아 **조용히 전부 통과**한다 — 켜져 있다고 믿게 만드는 실패다.
// 이 어댑터가 patch 텍스트에서 대상 경로를 뽑아 판정 로직에 넘긴다.
//
// 판정은 JSON `permissionDecision` 으로만 전달한다. 종료 코드로 차단하지 않는다.
// 전 구간 fail-open — 판정 불능이면 통과시킨다.

import fs from 'node:fs'
import path from 'node:path'

import { check } from './vendor/tdd-rules.mjs'

// `*** Add File: src/auth.ts` · `*** Update File: src/auth.ts`
//
// Delete 와 Move 는 대상이 아니다. 삭제에 테스트를 요구할 이유가 없고, 덮어쓰기는
// Delete + Add 로 오므로 Add 쪽에서 이미 걸린다.
const PATCH_TARGET = /^\*\*\* (?:Add|Update) File: (.+)$/gm

export function targetsOf(patchText) {
  if (typeof patchText !== 'string') return []
  return [...patchText.matchAll(PATCH_TARGET)].map((m) => m[1].trim()).filter(Boolean)
}

/**
 * @param {object} input  hook payload
 * @param {{exists: (p: string) => boolean}} ctx
 * @returns {null | {decision: 'deny', reason: string}}  null 은 통과
 */
export function evaluate(input, ctx) {
  if (!input || input.tool_name !== 'apply_patch') return null

  const cwd = input.cwd
  // 상대 경로를 절대화할 기준이 없으면 판정할 수 없다. 추측해서 막지 않는다.
  if (typeof cwd !== 'string' || cwd === '') return null

  const command = input.tool_input && input.tool_input.command
  const reasons = []

  for (const target of targetsOf(command)) {
    const verdict = check(path.resolve(cwd, target), { exists: ctx.exists, projectRoot: cwd })
    if (verdict) reasons.push(verdict.reason)
  }

  if (reasons.length === 0) return null
  return { decision: 'deny', reason: reasons.join('\n\n') }
}

function main() {
  let raw
  try {
    raw = fs.readFileSync(0, 'utf8')
  } catch {
    return
  }
  if (!raw.trim()) return

  let input
  try {
    input = JSON.parse(raw)
  } catch {
    return
  }

  const verdict = evaluate(input, { exists: (p) => fs.existsSync(p) })
  if (!verdict) return

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: verdict.decision,
        permissionDecisionReason: verdict.reason,
      },
    })
  )
}

// 이 파일은 훅으로도 실행되고 테스트에서 import 도 된다. 직접 실행일 때만 stdin 을 읽는다.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    main()
  } catch (e) {
    // 훅이 죽어도 도구는 실행된다. 원인만 한 줄 남긴다.
    process.stderr.write(`tdd_guard_adapter: ${e && e.message}\n`)
  }
  // process.exit() 를 부르지 않는다 — 파이프로 나가는 stdout 이 잘릴 수 있다.
}
