# Step 2: dashboard

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/DESIGN.md` — **"화면별 메모"의 대시보드 행·"카테고리 색 10종"·"도넛 조각에는 구분선을 넣는다"·"증감"·"타이포그래피" 가 이 step 의 단일 출처다**
- `/docs/USER_FLOW.md` — S21 · S22 · S28 · S29 · S31 · S33 · S35 · S37, 권한 매트릭스, "빈 상태"(DESIGN "화면별 메모")
- `/docs/ARCHITECTURE.md` — "패턴"(집계는 전부 SQL, 클라이언트로는 계산된 숫자만) · "AI 리뷰" 표 · "데이터 모델"(조회 시 카테고리는 `user_category_overrides` → `merchant_categories` 순)
- `/docs/ADR.md` — ADR-005 · ADR-012(리뷰 화면과 상세는 LLM 을 더 부르지 않는다)
- `/AGENTS.md` — 리포트와 AI 리뷰의 모든 수치는 SQL 집계 결과다. LLM 은 계산하지 않는다

이전 step 에서 만들어진 아래 파일을 **전부 읽고 시그니처를 확인한 뒤** 작업하라:

- `src/lib/session.ts` · `src/components/AppHeader.tsx` · `AppSidebar.tsx` · `Badge.tsx` (step 0)
- `src/components/UploadProgressCard.tsx` · `UploadSummary.tsx` · `UploadDialog.tsx` · `ProgressBar.tsx` (step 1)
- `src/app/(app)/dashboard/page.tsx` — step 1 이 진행률 카드와 다이얼로그 트리거까지 붙여두었다
- `src/lib/categories.ts` — `CATEGORIES`(10종) · `CATEGORY_COLORS`(light/dark) · `CATEGORY_TOKENS`(CSS 변수명) · `toCategory`
- `src/lib/signals/types.ts` — `Signal = { type, period, targetKey, impact, payload }`, `SIGNAL_TYPES` 5종
- `src/lib/signals/queries.ts` — **신호용 RPC 5종의 래퍼다. 이 step 에서 재사용하지 마라(아래 참조)**
- `supabase/migrations/20260817073000_signal_aggregates.sql` — 신호용 RPC 5종의 정의. **필터 조건을 반드시 눈으로 확인하라**
- `src/types/database.ts`

## 작업

### 1. 마이그레이션 — 대시보드 전용 RPC 4종

새 파일 `supabase/migrations/<타임스탬프>_dashboard_aggregates.sql`.

**신호용 RPC 5종(`get_category_monthly_totals` 등)을 대시보드에 재사용하지 마라.** 그 5종은 전부 `category_fallback = false` · `category is not null` · `amount > 0` 을 필터한다. 신호 탐지에는 맞지만 대시보드에 쓰면 **사용자가 실제로 쓴 돈보다 적은 금액이 표시된다** — 분류에 실패해 `기타` 로 들어간 거래가 통째로 사라지기 때문이다. 대시보드는 별도 함수를 쓴다.

네 함수 전부 아래 공통 규칙을 지킨다:

- **`transaction_type = 'expense'` 를 반드시 필터한다.** 빠뜨리면 환불이 지출로 잡힌다 (ARCHITECTURE "데이터 모델")
- **`category_fallback` 을 필터하지 않는다.** 분류 실패 건도 사용자가 쓴 돈이다
- **카테고리는 `user_category_overrides` → `transactions.category` → `'기타'` 순으로 결정한다.** `user_category_overrides` 를 `(user_id, merchant_normalized)` 로 LEFT JOIN 해 사용자가 고친 분류가 이기게 한다. 이유: 분류를 고치면 대시보드 집계가 다시 계산되어야 한다 (S4 · S37)
- 달 경계는 `date_trunc('month', transacted_on)::date` 다. 날짜 계산은 `Asia/Seoul` 기준으로 이미 저장된 `date` 컬럼을 쓰므로 함수 안에서 타임존 변환을 다시 하지 마라

```sql
-- 1) KPI + 같은 시점 비교. p_through_day 가 주어지면 그 일자까지만 집계한다
create or replace function public.get_dashboard_summary(
  p_user_id uuid, p_period date, p_through_day integer default null
) returns table (
  total_expense bigint, transaction_count bigint,
  refund_total bigint, deposit_total bigint,
  top_category public.transaction_category, top_category_amount bigint,
  active_days integer
)

-- 2) 도넛 + 정렬된 막대
create or replace function public.get_dashboard_category_breakdown(
  p_user_id uuid, p_period date
) returns table (
  category public.transaction_category, total_amount bigint, transaction_count bigint
)

-- 3) 6개월 지출 흐름
create or replace function public.get_dashboard_monthly_flow(
  p_user_id uuid, p_until_period date, p_months integer
) returns table (period date, total_amount bigint)

-- 4) 가맹점 상위
create or replace function public.get_dashboard_top_merchants(
  p_user_id uuid, p_period date, p_limit integer
) returns table (
  merchant_normalized text, total_amount bigint, transaction_count bigint,
  category public.transaction_category
)
```

- `refund_total` · `deposit_total` 은 `transaction_type` 이 각각 `refund` · `deposit` 인 합계다. **지출 합계에서 빼지 않고 나란히 낸다** (S12d)
- `get_dashboard_monthly_flow` 는 거래가 없는 달도 0으로 채워 **연속된 N개월**을 돌려준다. 빠진 달을 클라이언트에서 메우게 하지 마라
- 적용 후 `supabase gen types typescript --local` 결과를 `src/types/database.ts` 에 다시 저장한다

### 2. `src/lib/dashboard/queries.ts` — RPC 래퍼

`src/lib/signals/queries.ts` 와 같은 형태로 네 RPC 의 얇은 래퍼와 반환 타입을 둔다. `src/lib/` 이므로 **TDD Guard 대상이다. 테스트를 먼저 작성하라.** Supabase 클라이언트는 `Pick<SupabaseClient<Database>, "rpc">` 로 모킹한다.

### 3. `POST /api/signals/[id]/dismiss` — 인사이트 카드 숨기기

- 소유자를 확인하고 `spending_signals.dismissed_at` 을 기록한다 (S31)
- **entitlement 쓰기 게이트를 건다.** 숨기기는 쓰기이므로 `expired` 에서 막힌다 (USER_FLOW: "신호의 '숨기기'는 `dismissed_at` 을 쓰는 동작이므로 막는다")
- **왜 틀렸는지 묻지 마라.** MVP 는 재학습하지 않으므로 물으면 기대만 만든다 (S31)
- **`route.ts` 는 TDD Guard 검사 대상이다.** `route.test.ts` 를 먼저 작성하라 — 남의 신호 id 로 접근하면 거부, 만료 사용자면 403

### 4. 대시보드 화면 — `src/app/(app)/dashboard/page.tsx`

Server Component 로 집계를 읽고, 인터랙션이 필요한 조각만 client 로 뺀다.

레이아웃은 DESIGN "화면별 메모" 대시보드 행 그대로다: **KPI 4장 → 2열 그리드. 좌: 카테고리 도넛+막대 / 지출 흐름 막대 / 가맹점 상위. 우: 같은 시점 비교 + 인사이트 카드 3장.**

- **KPI 4장** — 이번 달 총지출(+전월 대비 증감) · 거래 건수 · 하루 평균 지출 · 가장 많이 쓴 카테고리. 숫자는 26px/500/−0.6px, `tabular-nums`, 우측 정렬
- **증감 표시** — 늘면 `--brand-red-dark`, 줄면 `--success-accent`. **색만으로 표현하지 말고 `+`/`−` 부호를 반드시 함께 쓴다** (DESIGN "증감"). 화면마다 방향을 뒤집지 마라
- **같은 시점 비교** — `get_dashboard_summary` 를 이번 달·지난달에 대해 `p_through_day = 오늘 일자` 로 각각 호출해 "지난달 같은 시점보다 …" 를 보여준다
- **카테고리 도넛 + 정렬된 막대** — 인라인 SVG 로 그린다. 차트 라이브러리를 새로 추가하지 마라
  - 색은 `src/lib/categories.ts` 의 매핑을 읽는다. **컴포넌트에 hex 를 직접 쓰지 마라** — `CATEGORY_TOKENS` 의 CSS 변수를 쓰면 라이트/다크가 자동으로 갈린다
  - **조각 사이에 카드 배경색 1px 선을 넣는다.** 교통(파랑)과 주거/통신(보라)이 ΔE76 13.6 으로 가장 가깝고 조각 순서가 금액순이라 인접을 막을 수 없다 (DESIGN "도넛 조각에는 구분선을 넣는다")
  - **도넛만 떼어 쓰지 마라. 정렬된 막대 목록을 항상 함께 둔다.** 행 앞의 색 점도 배경색 테두리를 갖는다
  - 도넛 중앙 금액은 `만원` 으로 줄인다
- **6개월 지출 흐름** — `get_dashboard_monthly_flow(p_months = 6)`. 막대 클릭이 그 달로 이동하면 좋지만 필수는 아니다
- **가맹점 상위** — `get_dashboard_top_merchants(p_limit = 5)`
- **인사이트 카드 3장** (S28) — `spending_signals` 에서 **선택한 달**의 `impact IS NOT NULL` · `dismissed_at IS NULL` 인 신호를 `impact` 내림차순 상위 3
  - `recurring_payment` 은 `impact` 가 NULL 이라 자동으로 빠진다. **타입으로 거르지 말고 `impact IS NOT NULL` 조건으로 걸러라**
  - 카드의 금액은 **`payload` 의 집계값을 그대로 렌더한다.** LLM 문장(`narrative`) 안의 숫자를 파싱해 표시하지 마라 (USER_FLOW 마지막 문단, AGENTS.md CRITICAL)
  - `narrative` 가 NULL 이면 문장 없이 숫자만 보여준다 — 서술 실패는 job 을 막지 않으므로 실제로 발생한다
  - 각 카드에 "숨기기"(위 dismiss 라우트)와 신호 상세 링크(`/dashboard/review/[yearMonth]/[signalId]`)를 둔다. **상세 화면은 2-review phase 가 만든다. 여기서는 링크까지다**
  - 카드 아래에 "전체 리뷰" 링크(`/dashboard/review/[yearMonth]`)를 둔다 (S35)
  - `narrative` 와 가맹점명은 **React 기본 이스케이프로 렌더한다. `dangerouslySetInnerHTML` 을 쓰지 마라**
- **빈 상태와 경계 케이스**
  - 거래가 하나도 없는 사용자(U2) → DESIGN "화면별 메모"의 빈 상태: 체험 배지 + 32px 제목 + 버튼 2개 → 3단계 카드 → "이런 문장을 받게 됩니다" 예시 3개
  - 선택한 달에 거래가 없음 → "이 달에는 거래가 없습니다" + 업로드 버튼 (S22)
  - 비교할 지난달이 없음 → **증감 자리를 비우고 "비교할 지난달 데이터가 없습니다"** (S21). 0% 나 `-` 로 채우지 마라
  - 첫 달이라 신호가 `outlier_transaction` 뿐 → 빈 카드 대신 **"다음 달이면 지난달과 비교해 드릴 수 있습니다"** (S29). 없는 것을 있는 척하지 않는다
- **숫자 카운트업 애니메이션을 쓰지 마라.** 흘러가는 동안 읽을 수 없다 (DESIGN "타이포그래피")

### 5. 월 선택

헤더의 월 칩(step 0)이 고르는 달이 이 화면의 기준이다. 선택 값은 URL 검색 파라미터(`?month=YYYY-MM`)로 들고, 없으면 가장 최근 거래 월을 쓴다. **클라이언트 전역 상태로 들지 마라.**

## Acceptance Criteria

```bash
supabase db reset   # 마이그레이션 적용 성공 (로컬)
npm run build       # 컴파일 에러 없음
npm run lint        # 경고 0
npm test            # dashboard/queries 테스트 · dismiss 라우트 테스트 포함 전부 통과
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 대시보드 RPC 4종이 `category_fallback` 을 필터하지 **않는가**? (필터하면 사용자가 쓴 돈보다 적게 표시된다)
   - 네 함수 전부 `transaction_type = 'expense'` 를 명시했는가?
   - 카테고리 결정이 `user_category_overrides` → `transactions.category` → `기타` 순인가?
   - 인사이트 카드가 `impact IS NOT NULL` 로 걸러지는가? (타입 하드코딩이 아니라)
   - 카드의 금액이 `payload` 집계값이고 `narrative` 를 파싱하지 않는가?
   - dismiss 라우트에 소유자 확인과 entitlement 게이트가 둘 다 있는가? 테스트를 먼저 썼는가?
   - 도넛 조각 사이에 배경색 1px 구분선이 있고 정렬된 막대가 함께 있는가?
   - 컴포넌트에 hex 하드코딩이 없는가?
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? ADR 기술 스택을 벗어나지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/1-dashboard/index.json` 의 step 2 를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step 이 알아야 할 것: 새 RPC 4종의 이름과 시그니처, `src/lib/dashboard/queries.ts` 의 함수명, dismiss 라우트 경로, 월 선택 파라미터 규약)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **신호용 RPC 5종(`get_category_monthly_totals` · `get_period_transactions` · `get_category_amount_medians` · `get_merchant_history` · `get_seen_merchants_before_period`)을 수정하거나 대시보드에서 호출하지 마라.** 이유: 그 필터는 신호 탐지 전용이고, 수정하면 이미 통과한 신호 테스트가 깨진다.
- **집계를 TypeScript 에서 하지 마라.** 이유: 집계는 전부 SQL 에서 하고 클라이언트로는 계산된 숫자만 내려보낸다 (ARCHITECTURE "패턴").
- **LLM 을 호출하지 마라.** 이유: 인사이트 카드의 문장은 업로드 시점에 이미 저장된 `narrative` 다. 대시보드는 LLM 호출이 0회다 (ADR-012).
- **분류를 고쳤을 때 신호를 다시 계산하지 마라.** 이유: 신호는 업로드 시점에만 만들어진다 (S37).
- **차트 라이브러리를 새로 추가하지 마라.** 이유: 도넛 하나와 막대 몇 개는 인라인 SVG 로 충분하고, 이 프로젝트의 의존성은 ADR 이 정한 범위다.
- **`dangerouslySetInnerHTML` 을 쓰지 마라.** 이유: `narrative` 와 가맹점명은 사용자·LLM 이 만든 문자열이다 (ARCHITECTURE "상태 관리").
- **거래 목록 화면·AI 리뷰 화면·신호 상세 화면을 만들지 마라.** 이유: 각각 step 3 과 2-review phase 의 몫이다. 이 step 은 링크까지다.
- 기존 테스트를 깨뜨리지 마라.
- 커밋하지 마라. execute.py 가 처리한다.
