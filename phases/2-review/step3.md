# Step 3: monthly-report

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ADR.md` — **ADR-006 전문이 이 step 의 단일 출처다.** "리포트 화면에 생성 시각과 '다시 만들기' 버튼을 항상 띄우고, 다시 만들지는 사용자가 정한다 … 같은 달 생성을 두 번 누르면 LLM 이 두 번 호출되므로 **생성 중 상태를 서버에서 확인해 중복 요청을 막는다**"
- `/docs/ADR.md` — ADR-005(리포트 생성은 쓰기, 기존 리포트 열람은 읽기) · ADR-008(서술은 `terra`)
- `/docs/USER_FLOW.md` — S5 · S21(데이터가 한 달치뿐) · S23(리포트 생성 후 그 달 거래 추가) · 권한 매트릭스
- `/docs/ARCHITECTURE.md` — "AI 리뷰" 다섯 표면 표(월간 리포트 코칭 문단 = 리포트 생성 시 1회) · "백그라운드"(월간 리포트는 업로드가 자동 생성하지 않는다)
- `/docs/DESIGN.md` — "화면별 메모"의 월간 리포트 행(760px 단일 컬럼, 제목 + 통계 3개 + 소제목 있는 문단 4~5개) · "타이포그래피"(리포트 제목 28px/1.25/500/−0.6px, 문단 15px/1.65/400)
- `/AGENTS.md` — **리포트의 모든 수치는 SQL 집계 결과다. LLM 은 주어진 숫자를 문장으로 엮기만 하고 어떤 수치도 계산하거나 생성하지 말 것**

이전 step 에서 만들어진 아래 파일을 **전부 읽고 시그니처를 확인한 뒤** 작업하라:

- `src/services/openai.ts` — `OPENAI_MODELS`(`{ classify, columnMapping, narrative }`) · `sanitizeMerchantName` · `describeSignals` · 내부의 `createJsonChatCompletion` 패턴. **`describeSignals` 를 그대로 본떠 만들어라**
- `src/lib/dashboard/queries.ts` 와 대시보드 RPC 4종 — 리포트의 수치는 **이 집계를 재사용한다**
- `src/app/(app)/dashboard/review/[yearMonth]/page.tsx` — `yearMonth` 파싱 규약
- `src/lib/session.ts` · `src/lib/entitlement.ts`
- `supabase/migrations/20260817072000_init.sql` — `monthly_reports (user_id, month) PK, narrative text not null, generated_at timestamptz not null default now()`

## 작업

### 1. 마이그레이션 — 생성 중 상태와 원자적 claim

새 파일 `supabase/migrations/<타임스탬프>_monthly_report_generation.sql`:

```sql
alter table public.monthly_reports
  add column generation_started_at timestamptz;

create or replace function public.claim_monthly_report_generation(
  p_user_id uuid, p_month date, p_stale_after interval
) returns boolean
```

`claim_monthly_report_generation` 은 **한 문장의 `insert … on conflict … do update … where` 로 구현한다.**

- row 가 없으면 `narrative = ''`, `generation_started_at = now()` 로 삽입하고 `true`
- row 가 있고 `generation_started_at` 이 NULL 이거나 `now() - p_stale_after` 보다 오래됐으면 `generation_started_at = now()` 로 갱신하고 `true`
- 그 외(이미 생성 중)는 갱신되지 않고 `false`
- **`select` 로 확인한 뒤 `update` 하는 방식으로 구현하지 마라.** 이유: 버튼을 두 번 빠르게 누르면 두 요청이 동시에 "생성 중 아님"을 보고 둘 다 LLM 을 호출한다. 판정과 점유가 한 문장 안에서 일어나야 한다
- `p_stale_after` 가 필요한 이유: 생성 도중 프로세스가 죽으면 `generation_started_at` 이 남아 그 달이 영영 잠긴다. 호출부는 5분을 넘긴다
- 적용 후 `supabase gen types typescript --local` 결과를 `src/types/database.ts` 에 다시 저장한다

### 2. `src/services/openai.ts` 에 `describeMonthlyReport` 추가

```ts
export type MonthlyReportFacts = {
  month: string;                    // "YYYY-MM"
  totalExpense: number;
  previousTotalExpense: number | null;   // 전월 데이터가 없으면 null
  transactionCount: number;
  categoryBreakdown: { category: Category; totalAmount: number }[];
  topMerchants: { merchantNormalized: string; totalAmount: number }[];
  signals: { type: SignalType; payload: Record<string, unknown>; impact: number | null }[];
};

export type MonthlyReportSection = { heading: string; body: string };

export async function describeMonthlyReport(
  facts: MonthlyReportFacts,
): Promise<MonthlyReportSection[]>;
```

- 모델은 **`OPENAI_MODELS.narrative`(terra)** 다. 호출 지점에 모델 문자열을 박지 마라 (ADR-008)
- **호출은 리포트 생성 1회뿐이다.** 문단마다 호출하지 마라
- **프롬프트에는 이미 계산된 숫자만 넣고, 모델에게 계산을 시키지 마라.** 합계·증감·비율은 전부 호출 전에 SQL 이 계산한 값이다 (AGENTS.md CRITICAL)
- **가맹점명은 `sanitizeMerchantName` 을 거쳐 싣는다.** 사용자가 CSV 로 넣은 문자열이 그대로 프롬프트에 들어가는 지점이다
- 출력은 `{ sections: [{ heading, body }] }` **JSON 으로 강제**하고 4~5개 섹션을 요구한다. 스키마를 벗어난 응답은 버리고 빈 배열을 돌려라
- **`previousTotalExpense` 가 null 이면 프롬프트에 "비교할 지난달 데이터가 없다" 를 명시하고, 비교 문단을 쓰지 말라고 지시한다.** 이유: 없는 비교를 지어내는 것이 이 제품이 가장 두려워하는 실패다 (S21)
- **테스트에서 OpenAI SDK 를 모킹하라.** 실제 API 를 호출하는 테스트를 만들지 마라

### 3. `POST /api/reports/[yearMonth]` — 리포트 생성·재생성

- **entitlement 쓰기 게이트를 건다.** 리포트 생성은 쓰기다 (ADR-005 · 권한 매트릭스). `evaluateEntitlement` 만 쓰고 `subscription_status` 를 직접 비교하지 마라
- `claim_monthly_report_generation(user_id, month, '5 minutes')` 를 호출한다. **`false` 면 즉시 409 로 끝낸다** — 이미 생성 중이다. LLM 을 부르지 마라
- claim 성공 후: 대시보드 RPC 로 그 달 수치를 모으고 → 그 달 신호를 읽고 → `describeMonthlyReport` 1회 → `monthly_reports` 에 `narrative`(섹션 배열을 JSON 문자열로 직렬화) · `generated_at = now()` · `generation_started_at = null` 을 저장한다
- **실패하면 `generation_started_at` 을 NULL 로 되돌린다.** 되돌리지 않으면 5분간 재시도할 수 없다. `narrative` 는 이전 값을 유지하고, 최초 생성 실패였다면 빈 문자열로 남는다 — **화면은 `narrative` 가 비면 "아직 리포트가 없습니다" 로 렌더한다**
- **`route.ts` 는 TDD Guard 검사 대상이다.** `route.test.ts` 를 **먼저** 작성하라:
  - 만료 사용자 403
  - claim 이 `false` 를 돌려주면 409 이고 **OpenAI 모킹이 호출되지 않았다**
  - 생성 성공 시 `generation_started_at` 이 NULL 로 정리된다
  - 생성 실패 시에도 `generation_started_at` 이 NULL 로 정리된다

### 4. `/dashboard/report/[yearMonth]` 화면

- **760px 단일 컬럼** (DESIGN)
- 제목(28px) + **통계 3개**(그 달 총지출 · 전월 대비 증감 · 거래 건수) + **소제목 있는 문단 4~5개**
  - 통계와 문단 안의 모든 금액은 **SQL 집계값**이다. LLM 문장 안의 숫자를 파싱해 표시하지 마라
  - 증감은 `+`/`−` 부호를 색과 함께 (DESIGN "증감"). 전월 데이터가 없으면 자리를 비우고 **"비교할 지난달 데이터가 없습니다"** (S21)
- **상단에 `generated_at`("3월 12일에 생성됨")과 "다시 만들기" 를 항상 띄운다.** 둘이 이 리포트의 유일한 갱신 경로다 (ADR-006 · S23). 리포트가 낡았는지 판단은 사용자가 한다
- 리포트가 없는 달 → "아직 리포트가 없습니다" + "리포트 만들기" 버튼
- 생성 중 → 진행 표시. 생성 완료 여부는 **화면을 다시 읽어** 판정한다
- **`expired` 사용자는 기존 리포트를 읽을 수 있고 생성만 막힌다.** 버튼을 비활성으로 두고 이유를 밝혀라. 화면 자체를 막지 마라
- `narrative` 를 React 기본 이스케이프로 렌더한다. **`dangerouslySetInnerHTML` 을 쓰지 마라.** JSON 파싱에 실패하면 저장된 문자열을 그대로 한 문단으로 보여준다

## Acceptance Criteria

```bash
supabase db reset   # 마이그레이션 적용 성공 (로컬)
npm run build       # 컴파일 에러 없음
npm run lint        # 경고 0
npm test            # 리포트 라우트 · describeMonthlyReport 테스트 포함 전부 통과 (실제 OpenAI 호출 0회)
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 중복 요청 차단이 **한 문장의 원자적 claim** 인가? `select` 후 `update` 가 아닌가?
   - claim 실패(409) 경로에서 OpenAI 가 호출되지 않는가? 그 테스트가 있는가?
   - 생성 성공·실패 양쪽에서 `generation_started_at` 이 정리되는가?
   - LLM 호출이 리포트 생성당 **1회** 인가?
   - 모델이 `OPENAI_MODELS.narrative` 를 통해 지정되는가? 문자열이 호출 지점에 박혀 있지 않은가?
   - 프롬프트에 계산되지 않은 원시 데이터를 넣거나 모델에게 계산을 요구하지 않는가?
   - 가맹점명이 `sanitizeMerchantName` 을 거치는가?
   - 화면의 모든 수치가 SQL 집계값인가? `narrative` 를 파싱하지 않는가?
   - `generated_at` 과 "다시 만들기" 가 항상 보이는가?
   - `expired` 에서 열람이 되고 생성만 막히는가?
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? ADR 기술 스택을 벗어나지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/2-review/index.json` 의 step 3 을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 phase 가 알아야 할 것: 생성 라우트 경로, `describeMonthlyReport` 시그니처, `narrative` 저장 형식, 새 컬럼·RPC 이름)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (OpenAI 키 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **업로드 파이프라인에서 리포트를 자동 생성하지 마라.** 이유: 한 달치를 나눠 올리는 사용자에게 업로드 횟수만큼 버려지는 LLM 호출이 발생한다. 재생성은 사용자가 누른다 (ADR-006).
- **리포트 생성 cron·스케줄러를 만들지 마라.** 이유: Inngest 함수는 업로드 처리 하나뿐이고 cron 은 없다 (ARCHITECTURE "백그라운드").
- **`is_stale` 같은 플래그 컬럼을 만들지 마라.** 이유: "3월 12일에 생성됨" 이라는 사실 하나로 사용자는 그 뒤 업로드가 반영되지 않았음을 안다. 컬럼과 파이프라인 한 단계를 줄이려고 잃는 것이 없다 (ADR-006).
- **LLM 에게 금액·비율·증감을 계산시키지 마라.** 이유: 틀린 금액을 그럴듯한 문장으로 제시하면 가계부 앱의 신뢰가 한 번에 무너진다 (AGENTS.md CRITICAL).
- **무엇을 지적할지 LLM 이 고르게 하지 마라.** 이유: 신호 선별은 결정론적 코드가 이미 했다. 리포트는 그 결과를 문장으로 옮길 뿐이다 (AGENTS.md CRITICAL).
- **문단마다 LLM 을 호출하지 마라.** 이유: 호출 횟수가 곧 비용이다. 한 번에 4~5개 섹션을 받는다.
- **`select` 로 생성 중 여부를 확인한 뒤 `update` 하지 마라.** 이유: 두 요청이 동시에 통과해 LLM 이 두 번 호출된다 (ADR-006).
- **`dangerouslySetInnerHTML` 을 쓰지 마라.** 이유: `narrative` 는 LLM 이 만든 문자열이다.
- **결제·Polar 코드를 만들지 마라.** 이유: 다음 phase 다.
- 기존 테스트를 깨뜨리지 마라.
- 커밋하지 마라. execute.py 가 처리한다.
