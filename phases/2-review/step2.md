# Step 2: subscriptions

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/USER_FLOW.md` — **S30(반복 지출 확인) · S32(구독료 인상 발견)** · 권한 매트릭스와 **"반복 지출 목록은 LLM 을 쓰지 않으므로 `expired` 에서도 열어둔다"** 문단
- `/docs/ARCHITECTURE.md` — "AI 리뷰" 절, 특히 **"`period` 는 그 신호를 뒷받침하는 관측 구간의 마지막 달이다. 반복 지출 목록은 `(user_id, type, 대상 키)` 별 최신 `period` row 하나만 읽는다"** 와 다섯 표면 표
- `/docs/ADR.md` — ADR-005 · ADR-012
- `/docs/DESIGN.md` — "타이포그래피"(금액은 `tabular-nums` 우측 정렬) · "증감"(`+`/`−` 부호를 반드시 함께)

이전 step 에서 만들어진 아래 파일을 **전부 읽고 시그니처를 확인한 뒤** 작업하라:

- `src/app/(app)/dashboard/review/[yearMonth]/page.tsx` — 리뷰 화면의 반복 결제 섹션. **같은 `payload` 키를 읽으므로 표현을 맞춰라**
- `src/lib/signals/thresholds.ts` — `SIGNAL_THRESHOLDS.recurring` · `SIGNAL_CONDITION_COPY` · `SIGNAL_TYPE_LABELS`
- `src/lib/signals/detect-recurring.ts` — `recurring_payment` 과 `recurring_price_up` 의 `targetKey`(정규화 가맹점명)와 `payload` 구성
- `src/lib/signals/queries.ts` — 기존 RPC 래퍼의 작성 방식(`Pick<SupabaseClient<Database>, "rpc">` 로 모킹)
- `supabase/migrations/20260817073000_signal_aggregates.sql` — 기존 RPC 스타일

## 작업

### 1. 마이그레이션 — 최신 반복 신호 조회 RPC

새 파일 `supabase/migrations/<타임스탬프>_recurring_signals.sql`:

```sql
create or replace function public.get_recurring_signals_latest(p_user_id uuid)
returns table (
  id uuid, type public.spending_signal_type, period date,
  target_key text, payload jsonb, impact bigint, narrative text
)
```

- **`(type, target_key)` 별로 `period` 가 가장 큰 row 하나씩만** 돌려준다(`distinct on (type, target_key) … order by type, target_key, period desc`)
- 대상은 `recurring_payment` 과 `recurring_price_up` 두 타입뿐이다
- **`dismissed_at` 을 필터하지 마라.** 숨기기는 대시보드 인사이트 카드의 동작이고 이 목록은 반복 지출의 전수 목록이다
- 적용 후 `supabase gen types typescript --local` 결과를 `src/types/database.ts` 에 다시 저장한다

**왜 최신 1건인가**: 같은 구독은 관측되는 달마다 신호 row 가 하나씩 쌓인다(`(user_id, type, period, target_key)` UNIQUE). 전부 읽으면 넷플릭스가 6줄로 보인다.

### 2. `src/lib/signals/queries.ts` 에 래퍼 추가

기존 다섯 래퍼와 같은 형태로 `fetchRecurringSignalsLatest(client, userId)` 를 더한다. **`src/lib/` 이므로 TDD Guard 대상이다 — 테스트를 먼저 작성하라.**

### 3. `/dashboard/subscriptions` 화면

Server Component. **LLM 호출 0회.**

- 표 열: **가맹점 · 금액 · 주기 · 지속 기간**
  - 가맹점 = `payload.merchantNormalized` (없으면 `target_key`)
  - 금액 = `payload.latestAmount`. 금액이 흔들리는 구독은 `payload.minAmount`~`maxAmount` 를 보조로
  - 주기 = `payload.intervalDays` 를 "약 N일마다" 로
  - 지속 기간 = `payload.occurrenceCount` 회, `payload.firstTransactedOn` ~ `payload.lastTransactedOn`
- **인상 표시** (S32) — 같은 `target_key` 에 `recurring_price_up` 이 있으면 그 행에 인상을 함께 보여준다: `payload.previousAmount` → `payload.latestAmount`, 그리고 **1년 환산(`payload.annualizedImpact`)**
  - 증가이므로 `--brand-red-dark` 이고 **`+` 부호를 반드시 함께 쓴다.** 색만으로 표현하지 마라 (DESIGN "증감")
  - 두 타입이 같은 가맹점에 대해 각각 row 를 가지므로 **`target_key` 로 합쳐 한 행으로 렌더한다.** 같은 구독이 두 줄로 보이면 안 된다
- 정렬은 `latestAmount` 내림차순. 인상이 있는 행을 위로 올려도 되지만 정렬 규칙을 화면에 밝혀라
- 빈 상태 → "아직 반복 지출로 볼 만한 결제가 없습니다" + `SIGNAL_CONDITION_COPY.recurring_payment` 를 그대로 붙여 **어떤 조건이면 잡히는지** 알린다. 이유: 미탐에 대한 답이 없으면 사용자는 기능이 고장난 줄 안다
- **`expired` 에서도 열린다.** LLM 을 쓰지 않아 비용이 0이고 오히려 재결제 동기가 된다 (S30 · USER_FLOW 권한 매트릭스). 화면을 막거나 사이드바에서 숨기지 마라
- `narrative` 는 있으면 보조로 쓰되 **금액은 `payload` 값을 렌더한다.** `narrative` 안의 숫자를 파싱하지 마라

## Acceptance Criteria

```bash
supabase db reset   # 마이그레이션 적용 성공 (로컬)
npm run build       # 컴파일 에러 없음
npm run lint        # 경고 0
npm test            # queries 래퍼 테스트 포함 전부 통과 (OpenAI 호출 0회)
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - RPC 가 `(type, target_key)` 별 최신 `period` 1건만 돌려주는가?
   - 같은 가맹점의 `recurring_payment` 과 `recurring_price_up` 이 한 행으로 합쳐지는가?
   - 인상 표시에 `+` 부호가 색과 함께 있는가?
   - **LLM 호출이 0회인가?**
   - `expired` 에서 화면이 열리는가?
   - 금액이 `payload` 값이고 `narrative` 를 파싱하지 않는가?
   - 신호용 RPC 5종을 수정하지 않았는가?
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? ADR 기술 스택을 벗어나지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/2-review/index.json` 의 step 2 를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step 이 알아야 할 것: 새 RPC 이름, 래퍼 함수명, 화면 경로)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **같은 `(type, target_key)` 의 모든 `period` row 를 다 보여주지 마라.** 이유: 같은 구독이 관측된 달 수만큼 줄로 늘어난다 (ARCHITECTURE "AI 리뷰").
- **LLM 을 호출하지 마라.** 이유: 이 목록은 `recurring_*` 신호를 SQL 로만 조회한다. 호출이 0회라는 것이 `expired` 에서 열어두는 근거다 (S30).
- **`expired` 에서 이 화면을 막지 마라.** 이유: 비용이 들지 않는 기능을 막을 이유가 없고 재결제 동기가 된다.
- **`recurring_payment` 에 `impact` 를 채우지 마라.** 이유: 영향도가 없는 것이 그 신호의 정의이고, 카드 선정 쿼리가 `impact IS NOT NULL` 로 걸러진다.
- **여기서 반복 결제를 다시 탐지하지 마라.** 이유: 신호는 업로드 시점에만 만들어진다 (S37). 이 화면은 읽기 전용이다.
- **구독 해지·알림 같은 기능을 만들지 마라.** 이유: MVP 범위 밖이고 요구에 없다.
- **신호용 RPC 5종을 수정하지 마라.** 이유: 이미 통과한 신호 테스트가 그 정의에 걸려 있다.
- 기존 테스트를 깨뜨리지 마라.
- 커밋하지 마라. execute.py 가 처리한다.
