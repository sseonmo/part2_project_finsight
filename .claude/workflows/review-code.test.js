import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// review-code.js 는 Workflow 런타임 전용 스크립트다. 최상위 await 를 쓰고
// agent/parallel/pipeline/phase/log/args 를 전역으로 받으므로 그냥 import 할 수 없다.
// 전역을 스텁으로 주입해 실행하고, 스텁이 받은 호출로 동작을 검증한다.
const WORKFLOW = path.join(path.dirname(fileURLToPath(import.meta.url)), 'review-code.js')
const SOURCE = readFileSync(WORKFLOW, 'utf8')

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

const DIMENSION_KEYS = ['correctness', 'security', 'architecture']

function okResult(label) {
  return { findings: [], walkthrough: label + ' 요약', praise: '' }
}

function finding(overrides = {}) {
  return {
    severity: 'major',
    file: 'src/app/api/uploads/[id]/route.ts',
    line: 42,
    in_diff: true,
    title: '업로드 job 소유자 확인 없이 상태를 갱신한다',
    tldr: 'service role 로 쓰므로 RLS 가 막지 못한다.',
    good: '서명 검증은 상단에서 통과시켰다.',
    fix: 'if (job.user_id !== session.user.id) return notFound()',
    ...overrides,
  }
}

const isReview = (opts) => opts.label.startsWith('review:')
const isVerify = (opts) => opts.label.startsWith('verify:')

// 'verify:security#0.2' → { dim: 'security', index: 0, vote: 2 }
function parseVerifyLabel(label) {
  const m = /^verify:(\w+)#(\d+)\.(\d+)$/.exec(label)
  return m ? { dim: m[1], index: Number(m[2]), vote: Number(m[3]) } : null
}

const confirm = (severity, reason = '코드에서 확인했다') => ({ verdict: 'confirmed', severity, reason })
const refute = (severity, reason = '상위에서 이미 막혀 있다') => ({ verdict: 'refuted', severity, reason })

/**
 * security 차원만 findingsList 를 보고하고, 검증자 응답은 voteImpl(index, vote, prompt) 로 정한다.
 */
function scenario(findingsList, voteImpl) {
  return (i, opts, prompt) => {
    if (isReview(opts)) {
      return opts.label === 'review:security'
        ? { findings: findingsList, walkthrough: '업로드 경로 점검', praise: '' }
        : okResult(opts.label)
    }
    const v = parseVerifyLabel(opts.label)
    return voteImpl(v.index, v.vote, prompt)
  }
}

async function run({ args = {}, agentImpl } = {}) {
  const record = { prompts: [], opts: [], parallelSizes: [], pipelineSizes: [], phases: [], logs: [] }

  const agent = async (prompt, opts) => {
    const i = record.prompts.length
    record.prompts.push(prompt)
    record.opts.push(opts)
    return agentImpl ? agentImpl(i, opts, prompt) : okResult(opts.label)
  }
  const parallel = async (thunks) => {
    record.parallelSizes.push(thunks.length)
    return Promise.all(
      thunks.map((t) =>
        Promise.resolve()
          .then(t)
          .catch(() => null)
      )
    )
  }
  // 실제 런타임처럼 항목마다 독립적으로 단계를 밟고, 단계가 던지면 그 항목만 null 이 된다.
  const pipeline = async (items, ...stages) => {
    record.pipelineSizes.push(items.length)
    return Promise.all(
      items.map(async (item, index) => {
        let value = item
        for (const stage of stages) {
          try {
            value = await stage(value, item, index)
          } catch {
            return null
          }
        }
        return value
      })
    )
  }
  const phase = (title) => record.phases.push(title)
  const log = (message) => record.logs.push(message)

  // `export const meta` 는 함수 본문에 넣을 수 없다. 전역으로 옮겨 캡처한다.
  const body = SOURCE.replace(/^export const meta =/m, 'globalThis.__wfMeta =')
  const fn = new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', body)
  const result = await fn(agent, parallel, pipeline, phase, log, args)

  return { result, record, meta: globalThis.__wfMeta }
}

function promptOf(record, key) {
  const i = record.opts.findIndex((o) => o.label === 'review:' + key)
  return i === -1 ? '' : record.prompts[i]
}

function reviewPrompts(record) {
  return record.prompts.filter((_, i) => isReview(record.opts[i]))
}

function verifyCalls(record) {
  return record.opts
    .map((o, i) => ({ opts: o, prompt: record.prompts[i] }))
    .filter((c) => isVerify(c.opts))
}

const dim = (result, key) => result.dimensions.find((d) => d.key === key)

describe('review-code 워크플로 — meta', () => {
  it('Workflow 도구가 요구하는 필드를 갖는다', async () => {
    const { meta } = await run()

    expect(meta.name).toBe('review-code')
    expect(typeof meta.description).toBe('string')
    expect(meta.description.length).toBeGreaterThan(0)
  })

  it('meta.phases 의 제목이 실제로 쓰인 phase 와 정확히 일치한다', async () => {
    const { meta, record } = await run({
      agentImpl: scenario([finding()], () => confirm('major')),
    })

    // 제목이 어긋나면 진행 표시가 별도 그룹으로 쪼개진다.
    const used = new Set([...record.phases, ...record.opts.map((o) => o.phase)])
    expect(meta.phases.map((p) => p.title).sort()).toEqual([...used].sort())
  })

  it('resume 을 깨뜨리는 API 를 쓰지 않는다', () => {
    expect(SOURCE).not.toMatch(/Date\.now\(/)
    expect(SOURCE).not.toMatch(/Math\.random\(/)
    expect(SOURCE).not.toMatch(/new Date\(\s*\)/)
  })
})

describe('review-code 워크플로 — fan-out', () => {
  it('3개 차원을 하나의 pipeline 으로 동시에 띄운다', async () => {
    const { record } = await run()

    // [3] 이어야 한다. [1,1,1] 이면 순차 실행이고 병렬로 쪼갠 의미가 없다.
    expect(record.pipelineSizes).toEqual([3])
    expect(reviewPrompts(record)).toHaveLength(3)
  })

  it('각 리뷰 에이전트에 차원 라벨과 스키마를 붙인다', async () => {
    const { record } = await run()
    const reviews = record.opts.filter(isReview)

    expect(reviews.map((o) => o.label)).toEqual(DIMENSION_KEYS.map((k) => 'review:' + k))
    for (const o of reviews) {
      expect(o.phase).toBe('Review')
      expect(o.schema).toBeTruthy()
    }
  })

  it('스키마가 4단계 심각도와 인라인 4줄 필드를 강제한다', async () => {
    const { record } = await run()
    const schema = record.opts.find(isReview).schema
    const item = schema.properties.findings.items

    expect(item.properties.severity.enum).toEqual(['critical', 'major', 'minor', 'nit'])
    // 인라인 코멘트 4줄: [심각도] 제목 / TL;DR / ✓ Good / → Fix
    for (const field of ['title', 'tldr', 'good', 'fix']) {
      expect(item.required).toContain(field)
    }
    // 인라인 앵커 판단에 필요하다.
    for (const field of ['file', 'line', 'in_diff']) {
      expect(item.required).toContain(field)
    }
    // required ⊆ properties 가 아니면 agent() 가 던진다.
    for (const r of item.required) {
      expect(item.properties).toHaveProperty(r)
    }
    for (const r of schema.required) {
      expect(schema.properties).toHaveProperty(r)
    }
  })
})

describe('review-code 워크플로 — 차원별 프롬프트', () => {
  it('security 프롬프트가 데이터 경계 규칙을 담는다', async () => {
    const { record } = await run()
    const p = promptOf(record, 'security')

    for (const rule of ['merchant_categories', 'csv_format_fingerprints', 'entitlement.ts', '서명 검증']) {
      expect(p).toContain(rule)
    }
  })

  it('architecture 프롬프트가 신뢰 경계·비용 구조 규칙을 담는다', async () => {
    const { record } = await run()
    const p = promptOf(record, 'architecture')

    for (const rule of ['thresholds.ts', 'ADR-008', '가맹점 100개', 'src/services/openai.ts']) {
      expect(p).toContain(rule)
    }
  })

  it('차원끼리 담당 영역이 섞이지 않는다', async () => {
    const { record } = await run()

    // correctness 가 보안·아키텍처 규칙까지 들고 있으면 렌즈를 나눈 의미가 없다.
    expect(promptOf(record, 'correctness')).not.toContain('merchant_categories')
    expect(promptOf(record, 'correctness')).not.toContain('ADR-008')
    expect(promptOf(record, 'security')).not.toContain('ADR-008')
  })

  it('모든 리뷰 프롬프트가 심각도 기준과 거짓 양성 금지를 담는다', async () => {
    const { record } = await run()

    for (const p of reviewPrompts(record)) {
      for (const s of ['critical', 'major', 'minor', 'nit']) {
        expect(p).toContain(s)
      }
      expect(p).toContain('확실하지 않으면 보고하지 마라')
    }
  })

  it('전달받은 대상과 base 를 리뷰 프롬프트에 실어 보낸다', async () => {
    const { record } = await run({
      args: { base: 'origin/main', files: ['src/lib/entitlement.ts', 'src/app/api/uploads/route.ts'] },
    })

    for (const p of reviewPrompts(record)) {
      expect(p).toContain('origin/main')
      expect(p).toContain('src/lib/entitlement.ts')
      expect(p).toContain('src/app/api/uploads/route.ts')
    }
  })
})

describe('review-code 워크플로 — 검증 인원', () => {
  it('critical·major 는 3명, minor 는 1명이 검증하고 nit 은 검증하지 않는다', async () => {
    const list = [
      finding({ severity: 'critical', line: 1 }),
      finding({ severity: 'major', line: 2 }),
      finding({ severity: 'minor', line: 3 }),
      finding({ severity: 'nit', line: 4 }),
    ]
    const { record, result } = await run({
      agentImpl: scenario(list, (index) => confirm(list[index].severity)),
    })

    const perIndex = [0, 1, 2, 3].map(
      (i) => verifyCalls(record).filter((c) => parseVerifyLabel(c.opts.label).index === i).length
    )
    expect(perIndex).toEqual([3, 3, 1, 0])

    // 검증을 건너뛴 nit 도 결과에서 사라지지 않는다.
    const nit = dim(result, 'security').findings.find((f) => f.severity === 'nit')
    expect(nit.verification).toBe('skipped')
  })

  it('검증 에이전트는 Verify phase 와 판정 스키마를 받는다', async () => {
    const { record } = await run({
      agentImpl: scenario([finding()], () => confirm('major')),
    })

    expect(verifyCalls(record)).toHaveLength(3)
    for (const { opts } of verifyCalls(record)) {
      expect(opts.phase).toBe('Verify')
      const schema = opts.schema
      expect(schema.properties.verdict.enum).toEqual(['confirmed', 'refuted'])
      expect(schema.properties.severity.enum).toEqual(['critical', 'major', 'minor', 'nit'])
      for (const r of schema.required) {
        expect(schema.properties).toHaveProperty(r)
      }
    }
  })

  it('검증자 3명은 서로 다른 관점을 받는다', async () => {
    const { record } = await run({
      agentImpl: scenario([finding()], () => confirm('major')),
    })

    const prompts = verifyCalls(record).map((c) => c.prompt)
    expect(prompts).toHaveLength(3)
    // 같은 프롬프트 셋이면 서로의 오판을 그대로 따라 한다.
    expect(new Set(prompts).size).toBe(3)
  })

  it('검증 프롬프트는 발견의 위치와 내용을 싣고 반박을 기본값으로 지시한다', async () => {
    const f = finding()
    const { record } = await run({
      agentImpl: scenario([f], () => confirm('major')),
    })

    expect(verifyCalls(record)).toHaveLength(3)
    for (const { prompt } of verifyCalls(record)) {
      expect(prompt).toContain(f.file + ':' + f.line)
      expect(prompt).toContain(f.title)
      expect(prompt).toContain(f.tldr)
      expect(prompt).toContain('확신이 없으면 refuted')
      expect(prompt).toContain('새 발견을 보고하지 마라')
    }
  })
})

describe('review-code 워크플로 — 검증 판정', () => {
  it('과반이 확인하면 확정으로 남기고 표 수를 기록한다', async () => {
    const f = finding()
    const { result } = await run({
      agentImpl: scenario([f], (_, vote) => (vote === 2 ? refute('major') : confirm('major'))),
    })

    const [kept] = dim(result, 'security').findings
    expect(kept).toMatchObject({ ...f, verification: 'confirmed', votes: '2/3', dimension: 'security' })
    expect(dim(result, 'security').dropped).toEqual([])
  })

  it('과반이 반박하면 결과에서 빼고 이유와 함께 dropped 에 남긴다', async () => {
    const f = finding()
    const { result, record } = await run({
      agentImpl: scenario([f], (_, vote) =>
        vote === 0 ? confirm('major') : refute('major', '미들웨어가 이미 소유자를 확인한다 (#' + vote + ')')
      ),
    })

    const security = dim(result, 'security')
    expect(security.findings).toEqual([])
    expect(security.dropped).toHaveLength(1)
    expect(security.dropped[0]).toMatchObject({ title: f.title, file: f.file, line: f.line })
    expect(security.dropped[0].reasons).toEqual([
      '미들웨어가 이미 소유자를 확인한다 (#1)',
      '미들웨어가 이미 소유자를 확인한다 (#2)',
    ])

    // 조용히 사라지면 리뷰가 얇아진 건지 알 수 없다.
    expect(record.logs.join('\n')).toContain('기각 1')
  })

  it('minor 는 1명의 반박으로 기각된다', async () => {
    const { result } = await run({
      agentImpl: scenario([finding({ severity: 'minor' })], () => refute('minor')),
    })

    expect(dim(result, 'security').findings).toEqual([])
    expect(dim(result, 'security').dropped).toHaveLength(1)
  })

  it('검증자는 심각도를 내릴 수 있고, 원래 등급을 남긴다', async () => {
    const { result } = await run({
      agentImpl: scenario([finding({ severity: 'major' })], (_, vote) =>
        vote === 2 ? refute('major') : confirm('minor')
      ),
    })

    const [kept] = dim(result, 'security').findings
    expect(kept.severity).toBe('minor')
    expect(kept.original_severity).toBe('major')
  })

  it('확인한 검증자 과반이 내리면 한 명이 반대해도 내린다', async () => {
    // 한 명의 반대로 하향이 막히면 과반 원칙과 어긋난다.
    const { result } = await run({
      agentImpl: scenario([finding({ severity: 'critical' })], (_, vote) =>
        vote === 0 ? confirm('major') : confirm('minor')
      ),
    })

    const [kept] = dim(result, 'security').findings
    expect(kept.severity).toBe('minor')
    expect(kept.original_severity).toBe('critical')
  })

  it('확인한 검증자 셋의 등급이 모두 다르면 가운데를 따른다', async () => {
    const { result } = await run({
      agentImpl: scenario([finding({ severity: 'critical' })], (_, vote) =>
        confirm(['critical', 'major', 'minor'][vote])
      ),
    })

    const [kept] = dim(result, 'security').findings
    expect(kept.severity).toBe('major')
    expect(kept.original_severity).toBe('critical')
  })

  it('확인한 검증자가 둘뿐이고 등급이 갈리면 무거운 쪽을 따른다', async () => {
    const { result } = await run({
      agentImpl: scenario([finding({ severity: 'major' })], (_, vote) =>
        [confirm('major'), confirm('minor'), refute('major')][vote]
      ),
    })

    const [kept] = dim(result, 'security').findings
    expect(kept.severity).toBe('major')
    expect(kept).not.toHaveProperty('original_severity')
  })

  it('올려 매긴 표는 원래 등급으로 잘린 뒤 과반에 들어간다', async () => {
    const { result } = await run({
      agentImpl: scenario([finding({ severity: 'major' })], (_, vote) =>
        confirm(['critical', 'critical', 'minor'][vote])
      ),
    })

    const [kept] = dim(result, 'security').findings
    expect(kept.severity).toBe('major')
    expect(kept).not.toHaveProperty('original_severity')
  })

  it('검증자는 심각도를 올릴 수 없다', async () => {
    const { result } = await run({
      agentImpl: scenario([finding({ severity: 'minor' })], () => confirm('critical')),
    })

    const [kept] = dim(result, 'security').findings
    expect(kept.severity).toBe('minor')
    expect(kept).not.toHaveProperty('original_severity')
  })

  it('검증자가 모두 죽으면 발견을 미검증으로 남긴다', async () => {
    const f = finding({ severity: 'critical' })
    const { result } = await run({
      agentImpl: scenario([f], () => null),
    })

    // 인프라 오류가 진짜 결함을 지우면 안 된다.
    const [kept] = dim(result, 'security').findings
    expect(kept).toMatchObject({ ...f, verification: 'unverified', votes: '0/3' })
    expect(dim(result, 'security').dropped).toEqual([])
  })

  it('한 명이 죽어 표가 1:1 로 갈리면 미검증으로 남긴다', async () => {
    const { result } = await run({
      agentImpl: scenario([finding()], (_, vote) => [confirm('major'), refute('major'), null][vote]),
    })

    const [kept] = dim(result, 'security').findings
    expect(kept.verification).toBe('unverified')
    expect(kept.severity).toBe('major')
  })

  it('남긴 발견은 검증 후 등급 기준으로 다시 정렬한다', async () => {
    const list = [
      finding({ severity: 'critical', line: 1, title: 'A' }),
      finding({ severity: 'major', line: 2, title: 'B' }),
    ]
    const { result } = await run({
      // A 는 minor 로 강등, B 는 그대로
      agentImpl: scenario(list, (index) => (index === 0 ? confirm('minor') : confirm('major'))),
    })

    expect(dim(result, 'security').findings.map((f) => f.title)).toEqual(['B', 'A'])
  })
})

describe('review-code 워크플로 — 결과 취합', () => {
  it('차원 구조와 실행 통계를 반환한다', async () => {
    const { result } = await run()

    expect(result.dimensions.map((d) => d.key)).toEqual(DIMENSION_KEYS)
    expect(result.dimensionsRun).toBe(3)
    expect(result.dimensionsFailed).toBe(0)
    for (const d of result.dimensions) {
      expect(d.findings).toEqual([])
      expect(d.dropped).toEqual([])
    }
  })

  it('한 차원이 죽어도 나머지 결과를 보존하고 실패를 드러낸다', async () => {
    const { result, record } = await run({
      agentImpl: (i, opts) => (opts.label === 'review:correctness' ? null : okResult(opts.label)),
    })

    const dead = dim(result, 'correctness')
    expect(dead.failed).toBe(true)
    expect(dead.findings).toEqual([])

    expect(dim(result, 'security').failed).toBe(false)
    expect(result.dimensionsFailed).toBe(1)

    // 죽은 차원에 대해서는 검증을 띄우지 않는다.
    expect(verifyCalls(record)).toEqual([])

    // 조용히 넘어가면 "3개 차원 다 봤다"로 읽힌다. 반드시 알려야 한다.
    expect(record.logs.join('\n')).toContain('correctness')
  })
})
