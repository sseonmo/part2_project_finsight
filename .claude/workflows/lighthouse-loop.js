export const meta = {
  name: 'lighthouse-loop',
  description: 'Lighthouse(모바일) 점수를 autoresearch 방식으로 올린다 — 라운드마다 후보 3개를 만들고 최고만 keep',
  whenToUse: '벤치 worktree 가 준비된 뒤 scriptPath 로 호출 (scripts/lighthouse/program.md 실행 절차)',
  phases: [
    { title: 'Baseline', detail: '현재 최고 커밋 재측정' },
    { title: 'Round', detail: '후보 3개 병렬 → 직렬 측정 → 최고만 keep' },
  ],
}

// 이 스크립트는 셸·파일 접근이 없다. 측정·판정·git 은 전부 벤치의 round.mjs 가 하고,
// 측정 에이전트는 그 출력(JSON)을 그대로 돌려줄 뿐이다. 판정을 LLM 이 하지 않게 하려는 것이다.
const a = typeof args !== 'undefined' && args ? args : {}
if (!a.bench) throw new Error('args.bench(벤치 worktree 절대 경로)가 필요하다')
if (!a.run) throw new Error('args.run(실행 번호)이 필요하다')
const RUN = a.run
const BENCH = a.bench
const ROUNDS = a.rounds || 2
const IDS = ['A', 'B', 'C']

const MEASURE_SCHEMA = {
  type: 'object',
  properties: { stdout: { type: 'string', description: '마지막 wait 출력 JSON 한 줄, 가공 없이 그대로' } },
  required: ['stdout'],
}
const CAND_SCHEMA = {
  type: 'object',
  properties: {
    committed: { type: 'boolean', description: '지정 브랜치에 커밋했는가' },
    summary: { type: 'string', description: '무엇을 왜 바꿨는지 한 줄' },
  },
  required: ['committed', 'summary'],
}

// round.mjs 의 encodeCandidates 와 같은 규칙. 스크립트는 import 할 수 없어 다시 둔다.
const encode = (list) =>
  encodeURIComponent(JSON.stringify(list)).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

function measurePrompt(name, cliArgs) {
  const out = `.local/lighthouse/run${RUN}-${name}.json`
  return [
    `Lighthouse 루프의 측정 단계를 실행하고 결과를 그대로 돌려준다. 해석·요약·재시도 금지.`,
    ``,
    `1. 실행 (Bash, 한 번만):`,
    `   cd ${BENCH} && mkdir -p .local/lighthouse && rm -f ${out} && nohup node scripts/lighthouse/round.mjs ${cliArgs} --out ${out} > ${out}.log 2>&1 &`,
    `2. 대기: 아래를 반복한다. 출력이 {"pending":true} 이면 같은 명령을 다시 실행한다. 한 번에 최대 9분 걸린다.`,
    `   cd ${BENCH} && node scripts/lighthouse/round.mjs wait --out ${out} --max 540`,
    `3. pending 이 아닌 출력이 나오면 그 JSON 한 줄을 stdout 필드에 그대로 담아 반환한다.`,
    ``,
    `규칙: 1번 명령을 두 번 실행하지 않는다(측정이 겹치면 점수가 흔들린다). 파일·브랜치를 고치지 않는다.`,
    `90분이 지나도 끝나지 않으면 stdout 에 {"ok":false,"error":"timeout — ${out}.log 확인"} 을 담아 반환한다.`,
  ].join('\n')
}

function candidatePrompt(c, bestCommit) {
  return [
    `Lighthouse(모바일) Performance 를 올리는 후보 변경 하나를 만든다.`,
    ``,
    `겨냥할 진단: \`${c.auditId}\` — 예상 절감 ${c.savingsMs}ms, 해당 페이지 ${c.pages.join(', ')}`,
    ``,
    `1. git switch -c ${c.branch} ${bestCommit}`,
    `2. scripts/lighthouse/program.md 를 읽고 그 규칙대로 수정한다.`,
    `3. git add 후 git commit -m "perf: <한 줄 요약>" — 브랜치 ${c.branch} 에 커밋 1개.`,
    `4. push 하지 않는다. 빌드·Lighthouse 는 돌리지 않는다(이 worktree 에는 node_modules 가 없다 — 측정은 다른 곳에서 한다).`,
    ``,
    `고칠 만한 것이 없다고 판단하면 커밋하지 말고 committed=false 와 이유를 반환한다.`,
  ].join('\n')
}

async function step(label, name, cliArgs) {
  const r = await agent(measurePrompt(name, cliArgs), { label, phase: label === 'measure:baseline' ? 'Baseline' : 'Round', schema: MEASURE_SCHEMA, effort: 'low' })
  if (!r) return { ok: false, error: '측정 에이전트가 결과 없이 끝났다' }
  try {
    return JSON.parse(r.stdout)
  } catch {
    return { ok: false, error: `측정 출력이 JSON 이 아니다: ${String(r.stdout).slice(0, 200)}` }
  }
}

const summary = { run: RUN, aborted: null, stop: null, bestPerf: null, rounds: [] }

phase('Baseline')
let s = await step('measure:baseline', 'base', `baseline --run ${RUN}`)

for (let r = 1; s.ok && r <= ROUNDS; r++) {
  if (s.stop.stop) break
  if (!s.hypotheses.length) {
    s = { ...s, stop: { stop: true, reason: 'no-hypotheses' } }
    break
  }

  phase('Round')
  const cands = s.hypotheses.slice(0, IDS.length).map((h, i) => ({
    ...h, id: IDS[i], branch: `perf/cand/run${RUN}-r${r}-${IDS[i].toLowerCase()}`,
  }))
  log(`run ${RUN} round ${r}: ${cands.map((c) => `${c.id}=${c.auditId}`).join(' ')} (현재 ${s.bestPerf})`)

  const bestCommit = s.bestCommit
  const outs = await parallel(cands.map((c) => () =>
    agent(candidatePrompt(c, bestCommit), { label: `cand:${r}:${c.id}:${c.auditId}`, phase: 'Round', isolation: 'worktree', schema: CAND_SCHEMA })))

  const list = cands.map((c, i) => ({
    id: c.id, auditId: c.auditId, branch: c.branch,
    description: outs[i] ? outs[i].summary : '후보 에이전트 실패',
  }))
  s = await step(`measure:round${r}`, `r${r}`, `evaluate --run ${RUN} --round ${r} --candidates ${encode(list)}`)
  if (s.ok) {
    summary.rounds.push({ round: r, winner: s.winner, results: s.results })
    log(`round ${r}: ${s.winner ? `keep ${s.winner} → ${s.bestPerf}` : 'keep 없음'}`)
  }
}

if (!s.ok) summary.aborted = s.error
else {
  summary.stop = s.stop
  summary.bestPerf = s.bestPerf
}
return summary
