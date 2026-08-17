# Step 6: signals

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/PRD.md` — **"신호 5종" 표가 조건과 영향도의 단일 출처다.** 표 아래 세 문단(절대액 조건이 왜 필요한지)까지 읽어라
- `/docs/ARCHITECTURE.md` — **"AI 리뷰" 절**. 신호 탐지는 집계 SQL + 순수 함수 판정이고 LLM 관여가 없다
- `/docs/ADR.md` — **ADR-004(임계값을 상수로 못박는다)** · ADR-012(신호 상세 화면이 임계값 문구를 읽는다)
- `/docs/USER_FLOW.md` — S28 · S29 · S30 · S32 · S33 · S35 · S36 · S37
- `/AGENTS.md` — 신호 선별을 LLM 이 하지 않는다는 CRITICAL 규칙

이전 step 에서 만들어진 파일:

- `supabase/migrations/*.sql` — `transactions` · `spending_signals` 의 실제 컬럼(`target_key` · `impact` nullable · `category_fallback`)
- `src/types/database.ts`
- `src/lib/categories.ts`
- `src/services/supabase.ts` — service role 클라이언트

## 작업

**LLM 은 이 step 에 전혀 등장하지 않는다.** 무엇을 지적할지도, 수치도 전부 코드가 정한다. LLM 은 step 7 에서 이미 선별된 신호를 문장으로 옮길 뿐이다.

**모든 파일이 TDD Guard 검사 대상이다. 테스트를 먼저 만들어라.**

### 1. `src/lib/signals/thresholds.ts` — 임계값의 유일한 출처

```ts
export const SIGNAL_THRESHOLDS = {
  categorySpike:       { minIncreaseRatio: 0.5,  minIncreaseKrw: 30_000 },
  newMerchantLarge:    { medianMultiple: 3,      minAmountKrw: 50_000 },
  outlierTransaction:  { minShareOfCategory: 0.3, minAmountKrw: 50_000, minCategoryMonthlyKrw: 100_000 },
  recurring:           { amountTolerance: 0.1, minIntervalDays: 25, maxIntervalDays: 35, minOccurrences: 3 },
  recurringPriceUp:    { minIncreaseRatio: 0.1, impactMonths: 12 },
} as const

export const SIGNAL_CONDITION_COPY: Record<SignalType, string>
```

- **임계값을 다른 파일에 복제하지 마라.** SQL 에 숫자를 박지도 마라 — 필요하면 이 상수를 인자로 넘겨라 (AGENTS.md CRITICAL)
- `SIGNAL_CONDITION_COPY` 는 신호 상세 화면의 **"왜 이 조건인가"** 고정 문구다. `SIGNAL_THRESHOLDS` 의 값을 문장에 끼워 넣어 만든다. **문구를 화면 쪽에 두지 마라** — 값만 바꾸고 문구를 두면 화면이 거짓말을 한다 (ADR-012). 값과 문구가 한 파일에서 같이 움직여야 한다
- 사용자 설정이나 통계적 자동 조정을 만들지 마라 (ADR-004)

### 2. `supabase/migrations/..._signal_aggregates.sql` — 원시 집계

집계는 SQL 이 한다 (ARCHITECTURE "패턴"). 판정에 필요한 **원시 숫자만** 내는 함수들을 추가한다. 예를 들어:

- 사용자 · 기간별 **카테고리 월 합계**
- 사용자 · 기간별 **거래 목록**(카테고리 · 금액 · 가맹점 · 날짜)
- 카테고리별 **거래 금액 중앙값**
- 가맹점별 **거래 이력**(반복 결제 판정용)
- 그 사용자가 **이전에 본 적 있는 가맹점 집합**

전부 아래를 지킨다:

- **`transaction_type = 'expense'` 필터를 반드시 명시한다.** 누락하면 환불이 지출로 잡힌다 (ARCHITECTURE "데이터 모델")
- **`category_fallback = true` 인 거래를 제외한다.** 분류 실패로 `기타` 가 된 건이라, 넣으면 실패가 몰린 달에 `기타` 급증이 신호로 올라온다
- **금액 0원 거래(포인트 전액 결제)를 비율 계산에서 제외한다**
- 판정(임계값 비교)을 SQL 안에서 하지 마라. SQL 은 숫자만 내고 판정은 3번의 순수 함수가 한다

### 3. `src/lib/signals/queries.ts` — 집계 호출 래퍼

위 SQL 함수를 부르는 타입 안전한 얇은 래퍼. 여기서 판정하거나 필터를 더하지 마라. 테스트는 Supabase 클라이언트를 모킹해 **RPC 이름과 인자가 맞게 전달되는지**만 고정하면 충분하다.

### 4. `src/lib/signals/detect-*.ts` — 판정 (이 step 의 본체)

신호 5종을 각각 **외부 의존이 없는 순수 함수**로 만든다. 공통 반환 타입:

```ts
export type Signal = {
  type: SignalType
  period: string                 // 관측 구간의 마지막 달 (YYYY-MM-01)
  targetKey: string              // spending_signals.target_key
  impact: number | null          // 원화 영향도. recurring_payment 은 null
  payload: Record<string, unknown>   // 화면이 렌더할 집계값. LLM 이 만든 값이 아니다
}
```

PRD "신호 5종" 표를 그대로 옮긴다. **5종 모두 비율 조건과 절대액 조건의 AND 다** (ADR-004):

| 함수 | 조건 | impact | targetKey |
|---|---|---|---|
| `detectCategorySpike` | 전월 대비 +50% **AND** 증가액 30,000원↑ | 증가액 | 카테고리 |
| `detectNewMerchantLarge` | 처음 보는 가맹점 **AND** 그 카테고리 중앙값의 3배↑ **AND** 50,000원↑ | 거래 금액 | 정규화 가맹점명 |
| `detectOutlierTransaction` | 단일 거래가 그 카테고리 월 지출의 30%↑ **AND** 50,000원↑ **AND** 그 카테고리 월 지출 100,000원↑ | 거래 금액 | 거래 id |
| `detectRecurring` | 금액 편차 10% 이내 · 간격 25~35일 · 3회↑ · 모든 달 월 1건 | **null** | 정규화 가맹점명 |
| (같은 함수) `recurring_price_up` | 위 조건 + 최근 금액 10%↑ | 인상분 × 12 | 정규화 가맹점명 |

반드시 지킬 것:

- **`recurring_payment` 의 `impact` 는 NULL 이다.** 0 이 아니라 NULL 이다 — 카드·코칭 문단 선정 쿼리가 `impact IS NOT NULL` 로 거른다. 구독을 쓰는 것은 평소와 다른 소비가 아니라 평소 그 자체다 (PRD)
- **전월 지출이 0인 카테고리는 `category_spike` 에서 제외한다.** 분모가 0이다
- `payload` 에는 화면이 그대로 렌더할 **집계 숫자**를 담는다. 화면은 이 값을 렌더하지 LLM 문장에서 숫자를 파싱하지 않는다 (USER_FLOW)
- 첫 달(비교할 전월이 없음)에는 `outlier_transaction` 만 작동한다. 나머지가 빈 배열을 돌려주는 것이 정상이다 (S29)

### 5. `src/lib/signals/index.ts` — 실행과 정렬

5종을 돌려 `Signal[]` 을 모으고 **원화 영향도 내림차순**으로 정렬한다. `impact` 가 NULL 인 것은 정렬 대상이 아니라 목록 뒤에 따로 둔다.

**상위 3개로 잘라내지 마라.** 카드가 3개를 보여줄 뿐이고 나머지는 AI 리뷰 화면이 읽는다 (ADR-012).

### 6. 테스트 — 경계값이 본체다

각 신호마다 **임계값 ±1** 을 픽스처로 고정한다. 최소한:

- `category_spike`: +49% / +50% / +51%, 증가액 29,999 / 30,000 / 30,001원, 전월 0원
- `new_merchant_large`: 중앙값 2.9배 / 3배 / 3.1배, 49,999 / 50,000원, 이미 본 가맹점
- `outlier_transaction`: 카테고리 비중 29% / 30% / 31%, 49,999 / 50,000원, 카테고리 월 지출 99,999 / 100,000원
- `recurring_payment`: 간격 24 / 25 / 35 / 36일, 금액 편차 9% / 10% / 11%, 2회 / 3회
- `recurring_price_up`: 인상 9% / 10% / 11%, `impact` 가 인상분 × 12 인지
- 공통: `category_fallback` 건이 섞여도 결과가 달라지지 않는다, 0원 거래가 비율을 흔들지 않는다, 첫 달에는 `outlier_transaction` 만 나온다

**오탐 케이스도 고정하라** — PRD 가 명시한 두 가지다: 카테고리 월 지출 30,000원인 달의 10,000원 결제가 `outlier_transaction` 으로 올라오지 않는다, 중앙값 2,000원인 카페에서 7,000원 첫 결제가 `new_merchant_large` 로 올라오지 않는다.

## Acceptance Criteria

```bash
supabase db reset   # 집계 함수 마이그레이션 적용 성공 (로컬)
npm run build       # 컴파일 에러 없음
npm run lint        # 경고 0
npm test            # 신호 5종 경계값 테스트 포함 전부 통과
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 임계값 숫자가 `thresholds.ts` 밖(특히 SQL 과 테스트 기대값 외의 코드)에 없는가?
   - `detect-*.ts` 가 DB · OpenAI 를 import 하지 않는가?
   - 집계 쿼리에 `transaction_type = 'expense'` 필터가 전부 있는가?
   - `recurring_payment` 의 `impact` 가 NULL 인가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-foundation/index.json` 의 step 6 을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step 이 알아야 할 것: `Signal` 타입 형태, 진입 함수 이름, 추가한 SQL 함수 이름)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **무엇을 지적할지 LLM 에게 고르게 하지 마라. 이 step 에서 OpenAI 를 import 하지 마라.** 이유: 선별까지 LLM 에 맡기면 결과가 재현되지 않아 테스트할 수 없고, 근거 없는 지적을 추측으로 채우게 된다 (AGENTS.md CRITICAL).
- **임계값을 사용자 설정이나 통계 기반 자동 조정으로 만들지 마라.** 이유: 임계값이 사용자마다 다르면 "왜 이건 안 잡혔나"를 재현할 수 없고, 신호 상세 화면이 임계값을 보여줄 수도 없다 (ADR-004 · ADR-012).
- **`small_frequent`(소액 다발) 같은 6번째 신호를 만들지 마라.** 이유: 건당 상한과 월 합계 하한을 실사용 분포 없이 정할 근거가 없어 미룬 결정이다 (ADR-004).
- **신호를 상위 N개로 잘라 반환하지 마라.** 이유: AI 리뷰 화면이 나머지를 읽는다 (ADR-012).
- **판정 로직을 SQL 안에 넣지 마라.** 이유: 경계값 픽스처 테스트에 Postgres 가 필요해지고, ADR-004 가 임계값을 상수로 못박은 근거가 "테스트할 수 있어야 한다" 였다.
- **`spending_signals` 에 쓰거나 기존 신호를 지우는 코드를 만들지 마라.** 이유: 저장과 재계산은 step 7 의 파이프라인이 한다. 같은 달을 다시 올려도 기존 신호를 지우지 않는 것이 규칙이다 (S33).
- 기존 테스트를 깨뜨리지 마라.
- 커밋하지 마라. execute.py 가 처리한다.
