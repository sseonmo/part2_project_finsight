export const meta = {
  name: 'review-code',
  description: 'correctness·security·architecture 3개 차원을 동시에 돌려 코드를 리뷰하고, 발견마다 반박 검증한다',
  phases: [
    { title: 'Review', detail: '3개 차원 동시 리뷰' },
    { title: 'Verify', detail: 'critical·major 3표 과반, minor 1표, nit 생략' },
  ],
}

// 이 스크립트는 파일시스템에 접근할 수 없다. 대상 정찰은 /review-code 커맨드가
// 메인 세션에서 하고 결과만 args 로 넘긴다. diff 열람과 파일 읽기는 각 에이전트가
// 자기 도구로 직접 한다.
const a = typeof args !== 'undefined' && args ? args : {}
const base = a.base || 'main'
const files = Array.isArray(a.files) ? a.files : []
const target = a.target || (files.length ? files.length + '개 변경 파일' : '작업 트리 변경분')

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'major', 'minor', 'nit'] },
          file: { type: 'string', description: '리포지토리 루트 기준 상대 경로' },
          line: { type: 'integer', description: '변경 후 파일 기준 줄 번호' },
          in_diff: {
            type: 'boolean',
            description: '그 줄이 이번 diff 에 포함되는가 (인라인 코멘트 앵커 가능 여부)',
          },
          title: { type: 'string', description: '무엇이 문제인지 명사구 한 줄' },
          tldr: { type: 'string', description: '왜 문제이고 언제 터지는지 한 문장' },
          good: { type: 'string', description: '그 지점에서 잘한 점 한 줄. 없으면 빈 문자열' },
          fix: { type: 'string', description: '적용할 수정 코드. 설명이 아니라 코드' },
        },
        required: ['severity', 'file', 'line', 'in_diff', 'title', 'tldr', 'good', 'fix'],
      },
    },
    walkthrough: { type: 'string', description: '이 차원의 렌즈로 본 변경 요약 1~2줄' },
    praise: { type: 'string', description: '이 차원에서 잘된 점. 없으면 빈 문자열' },
  },
  required: ['findings', 'walkthrough', 'praise'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['confirmed', 'refuted'] },
    severity: {
      type: 'string',
      enum: ['critical', 'major', 'minor', 'nit'],
      description: 'confirmed 일 때 매긴 등급. 원래 등급보다 무겁게 매겨도 원래 등급으로 잘린다',
    },
    reason: { type: 'string', description: '판정 근거 한두 문장. 확인한 파일:줄을 포함' },
  },
  required: ['verdict', 'severity', 'reason'],
}

// 발견 1건에 붙는 검증자 수. 판정을 Blocked·Changes Requested 로 올리는 등급에만 표를 늘린다.
// nit 은 틀려도 피해가 없어 검증 비용이 더 크다.
const VOTES = { critical: 3, major: 3, minor: 1, nit: 0 }

const SEVERITY_RANK = { critical: 0, major: 1, minor: 2, nit: 3 }

// 같은 프롬프트의 검증자 셋은 서로의 오판을 그대로 따라 한다. 관점을 하나씩 나눠 준다.
const LENSES = [
  '도달 가능성 — 지적한 조건이 실제 입력과 호출 경로로 발생하는가. 호출부를 거슬러 올라가 확인하라.',
  '이미 막혀 있는가 — 상위 가드, 미들웨어, DB 제약·트리거, RLS, 이후 마이그레이션, 타입 시스템이 이 문제를 이미 막고 있지 않은가.',
  '심각도 과장 — 문제가 실재하더라도 실제 피해가 주장한 등급만큼인가. 심각도 기준에 맞춰 다시 매겨라.',
]

const PROJECT_CONTEXT = [
  'FinSight — CSV 거래내역·카드명세서를 업로드하면 자동 분류해 지출 대시보드와 월간 리포트를 보여주는 개인 가계부 SaaS.',
  'Next.js 15 App Router / TypeScript strict / Supabase(Postgres+Auth+Storage) / Inngest(백그라운드 job) / OpenAI / Polar(결제) / Vercel.',
  '',
  '디렉터리: 라우트 핸들러 src/app/api/ · 백그라운드 함수 src/inngest/ · 컴포넌트 src/components/',
  '          타입 src/types/ · 외부 API 래퍼 src/services/ · 순수 로직 src/lib/',
  '',
  '데이터 흐름: 클라이언트가 서명 URL 로 Supabase Storage 에 직접 업로드 → Inngest 워커가 읽어 파싱',
  '           → 미매칭 고유 가맹점을 배치로 LLM 분류 → SQL 집계 → 결정론적 신호 탐지 → LLM 이 문장화',
].join('\n')

const SEVERITY_GUIDE = [
  '## 심각도 4단계',
  'critical — 배포되면 데이터 유실·보안 사고·과금 사고가 난다. 또는 CLAUDE.md 의 CRITICAL 규칙을 명백히 위반한다.',
  'major    — 특정 조건에서 잘못된 결과나 장애가 난다. 사용자가 실제로 겪는다.',
  'minor    — 동작은 하지만 유지보수·가독성에 실질적 영향이 있다.',
  'nit      — 취향·스타일 문제. 안 고쳐도 무방하다.',
].join('\n')

const FIELD_GUIDE = [
  '## 발견 1건의 형식 (인라인 코멘트 4줄로 그대로 렌더된다)',
  'title — 무엇이 문제인지 명사구 한 줄. 40자 안쪽. "개선 필요" 같은 빈 말 금지.',
  'tldr  — 왜 문제이고 언제 터지는지 한 문장. 조건을 구체적으로 적어라.',
  'good  — 그 지점에서 잘한 점 한 줄. 억지 칭찬은 하지 마라. 없으면 빈 문자열로 둬라.',
  'fix   — 적용할 수정 코드. 설명 문장이 아니라 코드다. 파일에 그대로 넣을 수 있는 형태로 써라.',
  'file / line — 리포 루트 기준 상대 경로와, 변경 후 파일 기준 줄 번호.',
  'in_diff — 그 줄이 이번 diff 에 포함되면 true, 변경되지 않은 기존 줄이면 false.',
  '          GitHub 은 diff 밖 줄에 인라인 코멘트를 달 수 없어 취합 단계에서 따로 처리한다. 정확히 판단하라.',
].join('\n')

// MVP 3개. 차원을 늘리려면 이 배열에 항목을 추가하기만 하면 된다.
// (남은 후보: performance, conventions, test coverage, cross-file consistency,
//  privacy, CPU/perf patterns, behavioral correctness)
const DIMENSIONS = [
  {
    key: 'correctness',
    label: '정확성 — 이 코드가 의도한 대로 동작하는가',
    focus: [
      '- 로직 오류, 조건 반전, off-by-one, 잘못된 비교 연산자',
      '- 타입 불일치. strict mode 는 통과하지만 런타임에 깨지는 형변환·as 단언·non-null 단언(!)',
      '- null / undefined 미처리. 옵셔널 체이닝으로 삼켜 잘못된 값이 조용히 흐르는 경우',
      '- async 처리: await 누락, 순차여야 할 것의 병렬화, 경쟁 조건, 중복 실행 방지 누락',
      '- 에러 처리: catch 후 삼키기, 실패했는데 성공으로 마감되는 경로, job 상태가 갱신되지 않는 이탈 경로',
      '- 금액 계산: 부동소수점 오차, 반올림 시점, 부호(환불·할인 행) 처리',
      '- 날짜·타임존: YYYY-MM 과 YYYY-MM-01 혼용, UTC/KST 경계로 거래가 옆 달로 넘어가는 문제',
      '- CSV/XLSX 파싱 엣지 케이스: 날짜 없는 행, 읽히지 않는 컬럼 때문에 행을 통째로 버리는 처리,',
      '  빈 값·따옴표·인코딩. (이 리포에서 실제로 두 번 터졌던 자리다)',
      '- SQL 집계와 그 결과를 쓰는 코드의 불일치: 그룹 기준, null 정렬(nulls last), 경계 조건',
    ].join('\n'),
  },
  {
    key: 'security',
    label: '보안·데이터 경계 — 남의 데이터를 만지거나 결제 없이 권한이 켜지는가',
    focus: [
      '이 프로젝트에는 service role 로 DB 에 쓰는 경로가 있어 RLS 가 막아주지 않는다. 아래를 특히 본다.',
      '',
      '- 서명 검증: /api/inngest 와 Polar 웹훅은 서명 검증을 통과한 요청만 처리해야 한다.',
      '  웹훅은 이벤트 ID 로 멱등 처리해야 한다 (재전송으로 구독이 두 번 켜지면 안 된다).',
      '- 소유자 확인: /api/uploads/:id 계열은 전부 job 소유자를 확인해야 한다.',
      '- Storage 키: 파일명은 반드시 서버가 생성한다. 클라이언트가 준 이름은 DB 컬럼에만 저장한다.',
      '  클라이언트가 키 문자열을 정하면 다른 사용자 경로에 쓸 수 있고 서명이 그 조작을 승인해 버린다.',
      '- 권한 판정: src/lib/entitlement.ts 한 곳에서만 한다. subscription_status 문자열을 직접 비교하면 결함이다',
      '  (canceled 는 기간 내에는 active 와 같은 권한이고, 체험 만료는 trial_started_at 으로 계산한다).',
      '  클라이언트에서 버튼을 숨기는 것은 게이트가 아니다.',
      '- 전역 캐시 오염: merchant_categories 에는 가맹점명과 카테고리만 들어간다. 금액·날짜·user_id 가 들어가면',
      '  critical 이다. 사용자의 카테고리 수정은 user_category_overrides 에만 반영하고 전역 캐시를 덮어써서는 안 된다.',
      '- 개인 범위 캐시: csv_format_fingerprints 는 (user_id, 헤더 해시) 로 개인 범위다. 전역 공유는 critical 이다.',
      '- 프롬프트 인젝션: 가맹점명은 사용자가 CSV 로 넣는 문자열이며 그대로 LLM 프롬프트에 들어간다.',
      '  프롬프트에 싣기 전 길이 상한과 개행·제어문자 제거를 거쳐야 하고, 분류 출력은 카테고리 10종 enum 으로',
      '  강제해 벗어난 값은 기타로 폴백해야 한다.',
      '- RLS: 모든 사용자 데이터 테이블에 user_id = auth.uid() 정책이 있어야 한다.',
      '- 그 밖에 인증 우회, 비밀값 노출, 클라이언트로 새는 service role 키.',
    ].join('\n'),
  },
  {
    key: 'architecture',
    label: '아키텍처 — 레이어·신뢰 경계·비용 구조를 지켰는가',
    focus: [
      '- 호출 위치: 외부 API 호출(OpenAI, Polar, Supabase service role)은 src/app/api/ 라우트 핸들러와',
      '  src/inngest/ 함수에서만 한다. 클라이언트 컴포넌트에서 직접 호출하면 결함이다.',
      '- LLM 신뢰 경계 (수치): 리포트와 AI 리뷰의 모든 수치는 SQL 집계 결과다. LLM 은 주어진 숫자를 문장으로',
      '  엮기만 하고 어떤 수치도 계산하거나 생성해서는 안 된다.',
      '- LLM 신뢰 경계 (선별): 무엇을 지적할지도 LLM 이 고르지 않는다. 신호 탐지는 src/lib/signals/ 의',
      '  결정론적 코드가 하고(SQL 이 원시 집계, 순수 함수가 판정), 우선순위는 원화 영향도 점수가 정한다.',
      '  임계값은 src/lib/signals/thresholds.ts 한 파일에만 있어야 한다. 다른 곳에 숫자가 박히면 결함이다.',
      '- 비용 구조: LLM 분류 호출 단위는 거래가 아니라 미매칭 고유 가맹점 100개 배치다. 거래 1건당 LLM 호출은',
      '  critical 이다. 신호 서술도 업로드당 배치 1회로 끝나야 한다.',
      '- 모델 상수: 모델명은 src/services/openai.ts 상수에만 둔다. 호출 지점에 문자열로 박으면 결함이다.',
      '  세 호출을 한 모델로 통일해서도 안 된다 — 분류는 비용 지배적이라 최저가(luna), 컬럼 매핑은 틀리면',
      '  거래가 통째로 엉뚱한 달로 가고 그 오답이 개인 캐시에 굳으므로 상위(terra)다 (ADR-008).',
      '- 업로드 경로: 원본 파일은 Next.js 서버를 통과하지 않는다. 클라이언트가 서명 URL 로 Storage 에 직접 올리고,',
      '  읽기는 Inngest 워커만 한다.',
      '- 디렉터리 분리: 컴포넌트는 src/components/, 타입은 src/types/, 외부 API 래퍼는 src/services/,',
      '  순수 로직은 src/lib/. 순수 로직에 I/O 가 섞이거나 래퍼에 도메인 판단이 들어가면 지적한다.',
      '- 한 곳에 있어야 할 판단이 여러 곳에 복제되었는가. 기존 유틸이 있는데 새로 만들었는가.',
    ].join('\n'),
  },
]

function buildPrompt(d) {
  const others = DIMENSIONS.filter((x) => x.key !== d.key)
    .map((x) => x.key)
    .join(', ')

  return [
    '너는 FinSight 리포지토리의 코드 리뷰어다. 담당 차원은 하나뿐이다: ' + d.key,
    '(' + d.label + ')',
    '',
    '## 프로젝트',
    PROJECT_CONTEXT,
    '',
    '## 리뷰 대상',
    'base 브랜치: ' + base,
    '대상: ' + target,
    files.length
      ? '변경 파일:\n' + files.map((f) => '  - ' + f).join('\n')
      : '변경 파일 목록이 전달되지 않았다. git status 와 git diff 로 직접 파악하라.',
    '',
    '## 먼저 할 일',
    '1. git diff ' + base + '...HEAD -- <파일>  로 커밋된 변경을 본다.',
    '2. git diff -- <파일>  와  git diff --cached -- <파일>  로 아직 커밋되지 않은 변경을 본다.',
    '3. 변경된 줄만 보지 마라. 그 줄이 호출하거나 의존하는 코드를 파일을 열어 확인하라.',
    '   결함은 변경된 줄이 아니라, 그 줄이 잘못 쓰고 있는 기존 코드 쪽에 있을 때가 많다.',
    '4. 리뷰를 시작하기 전에 CLAUDE.md 의 "아키텍처 규칙" 절을 반드시 읽어라. 아래 "네가 볼 것" 은 그 요약일 뿐이며,',
    '   둘이 다르면 CLAUDE.md 가 우선이다. 판단이 애매하면 docs/ARCHITECTURE.md, docs/ADR.md 도 확인하라.',
    '',
    '## 네가 볼 것',
    d.focus,
    '',
    '## 네가 보지 않을 것',
    '다른 에이전트가 ' + others + ' 차원을 동시에 보고 있다. 그 영역의 발견은 보고하지 마라.',
    '경계가 애매하면, 네 차원의 렌즈로 문제를 설명할 수 있을 때만 보고한다.',
    '',
    SEVERITY_GUIDE,
    '',
    FIELD_GUIDE,
    '',
    '## 거짓 양성 금지',
    '확실하지 않으면 보고하지 마라. 코드를 실제로 읽어 확인하기 전에 추측으로 보고하지 마라.',
    '"~일 수 있다" "~할 가능성이 있다" 수준에 머무르면 빼라.',
    '발견 0건은 정상적인 결과다. 틀린 지적 1건이 맞는 지적 5건의 신뢰를 깎는다.',
    '',
    '## 반환',
    'findings 는 심각도 높은 순으로 정렬해 담아라.',
    'walkthrough 는 네 차원의 렌즈로 본 이번 변경 요약 1~2줄이다.',
    'praise 는 이번 변경에서 잘된 점이다. 없으면 빈 문자열로 둬라.',
  ].join('\n')
}

function verifyPrompt(f, d, lens) {
  return [
    '너는 코드 리뷰 발견을 검증하는 반박자다. ' + d.key + ' 차원의 리뷰어가 아래 발견을 보고했다.',
    '네 일은 이 발견이 틀렸음을 보이려고 시도하는 것이다. 리뷰어의 말을 믿지 말고 코드로 확인하라.',
    '',
    '## 프로젝트',
    PROJECT_CONTEXT,
    '',
    '## 검증할 발견',
    '심각도: ' + f.severity,
    '위치: ' + f.file + ':' + f.line,
    '제목: ' + f.title,
    'TL;DR: ' + f.tldr,
    '제안된 수정:',
    f.fix,
    '',
    '## 네 검증 관점',
    lens,
    '',
    '## 방법',
    '1. ' + f.file + ' 을 열어 ' + f.line + '번 줄 주변을 직접 읽어라. 발견이 가리키는 코드가 실제로 거기 있는지부터 확인하라.',
    '2. 관점에 따라 호출부, 상위 코드, 설정, 마이그레이션(supabase/migrations/)을 따라가라.',
    '3. 코드로 문제가 확인되면 confirmed, 틀렸거나 확인할 수 없으면 refuted 다.',
    '   확신이 없으면 refuted 가 기본값이다. 그럴듯하다는 이유로 confirmed 하지 마라.',
    '',
    SEVERITY_GUIDE,
    '',
    '## 등급',
    'confirmed 라면 위 기준으로 등급을 다시 매겨라. 원래 등급(' + f.severity + ')보다 무겁게 매길 수는 없다.',
    'refuted 라면 원래 등급(' + f.severity + ')을 그대로 적어라.',
    '',
    '## 금지',
    '새 발견을 보고하지 마라. 이 발견 하나만 판정한다. 코드를 수정하지 마라.',
    '',
    '## 반환',
    'reason 에는 판정 근거를 한두 문장으로 쓰고, 확인한 파일:줄을 포함하라.',
  ].join('\n')
}

function bySeverity(x, y) {
  return SEVERITY_RANK[x.severity] - SEVERITY_RANK[y.severity]
}

// 검증자는 등급을 내릴 수만 있다. 원래 등급보다 무겁게 매긴 표는 원래 등급으로 자른다.
// 등급은 확인한 검증자의 과반(동률이면 절반)이 지지하는 가장 무거운 등급이다.
// 셋이면 가운데 값이고, 한 명의 반대로 과반의 하향이 막히지 않는다.
function settleSeverity(original, confirmations) {
  const clamped = confirmations
    .map((c) => (SEVERITY_RANK[c.severity] < SEVERITY_RANK[original] ? original : c.severity))
    .sort((x, y) => SEVERITY_RANK[x] - SEVERITY_RANK[y])
  if (clamped.length === 0) return original
  return clamped[Math.ceil(clamped.length / 2) - 1]
}

async function verifyFinding(f, d, j) {
  const n = VOTES[f.severity]
  const tagged = Object.assign({}, f, { dimension: d.key })
  if (n === 0) {
    return Object.assign(tagged, { verification: 'skipped', votes: '0/0' })
  }

  const lenses = n === 1 ? [LENSES.join('\n')] : LENSES.slice(0, n)
  const votes = (
    await parallel(
      lenses.map((lens, v) => () =>
        agent(verifyPrompt(f, d, lens), {
          label: 'verify:' + d.key + '#' + j + '.' + v,
          phase: 'Verify',
          schema: VERDICT_SCHEMA,
        })
      )
    )
  ).filter(Boolean)

  const yes = votes.filter((x) => x.verdict === 'confirmed')
  const no = votes.filter((x) => x.verdict === 'refuted')

  // 과반은 살아남은 표가 아니라 배정한 인원 기준이다. 검증자가 죽어 과반이 안 되면
  // 인프라 오류가 진짜 결함을 지우지 않도록 미검증으로 남긴다.
  if (yes.length * 2 > n) {
    const severity = settleSeverity(f.severity, yes)
    const kept = Object.assign(tagged, {
      severity: severity,
      verification: 'confirmed',
      votes: yes.length + '/' + n,
      reasons: yes.map((x) => x.reason),
    })
    if (severity !== f.severity) kept.original_severity = f.severity
    return kept
  }
  if (no.length * 2 > n) {
    return Object.assign(tagged, {
      verification: 'refuted',
      votes: yes.length + '/' + n,
      reasons: no.map((x) => x.reason),
    })
  }
  return Object.assign(tagged, {
    verification: 'unverified',
    votes: yes.length + '/' + n,
    reasons: votes.map((x) => x.reason),
  })
}

async function verifyDimension(r, d) {
  if (!r) return null
  const raw = Array.isArray(r.findings) ? r.findings : []
  const checked = await parallel(raw.map((f, j) => () => verifyFinding(f, d, j)))

  const findings = []
  const dropped = []
  for (let j = 0; j < raw.length; j++) {
    // verifyFinding 자체가 던진 경우도 결함을 지우지 않는다.
    const c =
      checked[j] ||
      Object.assign({}, raw[j], {
        dimension: d.key,
        verification: 'unverified',
        votes: '0/' + VOTES[raw[j].severity],
        reasons: [],
      })
    if (c.verification === 'refuted') dropped.push(c)
    else findings.push(c)
  }
  findings.sort(bySeverity)

  return { findings: findings, dropped: dropped, walkthrough: r.walkthrough || '', praise: r.praise || '' }
}

log(DIMENSIONS.length + '개 차원 동시 리뷰: ' + DIMENSIONS.map((d) => d.key).join(' · '))

// 차원마다 리뷰가 끝나는 즉시 그 차원의 발견을 검증한다. 다른 차원을 기다리지 않는다.
const results = await pipeline(
  DIMENSIONS,
  (d) =>
    agent(buildPrompt(d), {
      label: 'review:' + d.key,
      phase: 'Review',
      schema: FINDINGS_SCHEMA,
    }),
  (r, d) => verifyDimension(r, d)
)

const dimensions = []
let failed = 0
for (let i = 0; i < DIMENSIONS.length; i++) {
  const key = DIMENSIONS[i].key
  const r = results[i]
  if (!r) {
    failed++
    // 조용히 넘어가면 "3개 차원 다 봤다"로 읽힌다.
    log('차원 실패 — ' + key + ' 는 결과를 내지 못했다. 이 차원은 리뷰되지 않았다.')
    dimensions.push({ key: key, failed: true, findings: [], dropped: [], walkthrough: '', praise: '' })
    continue
  }
  dimensions.push(Object.assign({ key: key, failed: false }, r))
}

const kept = dimensions.flatMap((d) => d.findings)
const count = (v) => kept.filter((f) => f.verification === v).length
const droppedCount = dimensions.reduce((n, d) => n + d.dropped.length, 0)
log(
  '완료 — ' + (DIMENSIONS.length - failed) + '/' + DIMENSIONS.length + '개 차원 · ' +
    '확정 ' + count('confirmed') + ' · 미검증 ' + count('unverified') + ' · 검증 생략 ' + count('skipped') +
    ' · 기각 ' + droppedCount
)

return {
  base: base,
  target: target,
  files: files,
  dimensionsRun: DIMENSIONS.length,
  dimensionsFailed: failed,
  dimensions: dimensions,
}
