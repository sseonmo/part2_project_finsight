# Step 1: signal-detail

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ADR.md` — **ADR-012 전문.** "상세 화면은 그 문장이 어느 거래에서 나왔는지와 어떤 조건으로 판정했는지를 펼친다 … LLM 호출이 0회다" · "판정 조건 문구가 `thresholds.ts` 와 함께 움직여야 한다 — 값만 바꾸고 문구를 두면 화면이 거짓말을 한다"
- `/docs/ADR.md` — ADR-004(임계값을 상수로 못 박은 것은 그 값을 사용자에게 보여줄 수 있게 만든 결정이기도 하다)
- `/docs/USER_FLOW.md` — **S36(문장의 근거 확인) · S38(없는 신호 ID)** · 권한 매트릭스
- `/docs/DESIGN.md` — "화면별 메모"의 신호 상세 행(문장 18px → 판정 수치 4개 → "왜 이 조건인가" 패널 → 근거 거래 표(해당 행 `--surface-soft` 강조 + "증거" 표시)) · "앱 셸"(신호 상세 최대 폭 880px)
- `/docs/ARCHITECTURE.md` — "AI 리뷰" 절, 다섯 표면 표

이전 step 에서 만들어진 아래 파일을 **전부 읽고 시그니처를 확인한 뒤** 작업하라:

- `src/app/(app)/dashboard/review/[yearMonth]/page.tsx` — 리뷰 화면(직전 step). 각 신호 카드가 이 화면으로 링크한다. **조회 방식과 `yearMonth` 파싱 규약을 맞춰라**
- `src/lib/signals/thresholds.ts` — `SIGNAL_THRESHOLDS` · **`SIGNAL_CONDITION_COPY`** · `SIGNAL_TYPE_LABELS`
- `src/lib/signals/detect-category-spike.ts` · `detect-new-merchant-large.ts` · `detect-outlier-transaction.ts` · `detect-recurring.ts` — **`targetKey` 와 `payload` 가 어떻게 채워지는지 직접 확인하라**
- `src/lib/categories.ts` — `CATEGORY_TOKENS`
- `supabase/migrations/20260817072000_init.sql` — `spending_signals` · `transactions`

## 작업

### `/dashboard/review/[yearMonth]/[signalId]` 화면

최대 폭 880px. Server Component 로 읽고 **LLM 을 호출하지 않는다.**

- 신호를 `id` 로 조회하고 **소유자와 `period` 가 URL 의 `yearMonth` 와 일치하는지 확인한다.** 저장된 신호가 아니면 404 + "이 신호를 찾을 수 없습니다" + 리뷰로 돌아가기 (S38)

#### 1. 문장

`narrative` 를 18px/1.55/400 으로. NULL 이면 문장 자리를 비우고 아래 수치만 보여준다.

#### 2. 판정 수치 — 타입별

`payload` 의 값을 그대로 렌더한다. **여기서 어떤 수치도 새로 계산하지 마라.** 타입별로 아래를 보여준다:

| 타입 | 보여줄 수치 (`payload` 키) |
|---|---|
| `category_spike` | 지난달 지출(`previousTotal`) · 이번 달 지출(`currentTotal`) · 증가액(`increaseAmount`) · 증가율(`increaseRatio`) |
| `new_merchant_large` | 결제액(`amount`) · 카테고리 중앙값(`medianAmount`) · 중앙값 대비(`medianMultiple`) |
| `outlier_transaction` | 결제액(`amount`) · 카테고리 월 지출(`categoryTotal`) · 카테고리 내 비중(`shareOfCategory`) |
| `recurring_payment` | 최근 결제액(`latestAmount`) · 금액 범위(`minAmount`~`maxAmount`) · 결제 횟수(`occurrenceCount`) · 결제 간격(`intervalDays`) |
| `recurring_price_up` | 직전 결제액(`previousAmount`) · 최근 결제액(`latestAmount`) · 인상액(`increaseAmount`) · 1년 환산(`annualizedImpact`) |

- 비율은 `%`, 금액은 천 단위 쉼표 + `원`, 전부 `tabular-nums`
- `payload` 에 기대한 키가 없으면 그 칸을 비운다. **없는 값을 0으로 채우거나 다른 값에서 유도하지 마라** — 화면이 거짓말을 하게 된다

#### 3. "왜 이 조건인가" 패널

**`SIGNAL_CONDITION_COPY[signal.type]` 를 그대로 렌더한다.** 문구를 이 화면에서 다시 쓰거나 요약하지 마라. 그 문자열은 `SIGNAL_THRESHOLDS` 값을 끼워 만들어져 있어서, 임계값을 바꾸면 화면 문구가 함께 바뀐다 (ADR-012).

**미탐에 대한 답이기도 하다** — 오탐만큼이나 "왜 이건 안 잡혔나"가 이 기능을 죽인다. 조건을 감추지 마라.

#### 4. 근거 거래 표 — 타입별 5분기

`transactions` 를 RLS 세션 클라이언트로 조회한다. **타입마다 뽑는 범위가 다르다** (ADR-012 트레이드오프):

| 타입 | `target_key` | 근거 거래 범위 | 강조할 행 |
|---|---|---|---|
| `category_spike` | 카테고리명 | 그 달과 **직전 달**의 그 카테고리 거래 전부 | 없음 (두 달 소계를 함께 보여준다) |
| `new_merchant_large` | `merchant_normalized` | 그 가맹점의 거래 전부 | `payload.transactionId` |
| `outlier_transaction` | 거래 `id` | 그 거래가 속한 **그 달 그 카테고리** 거래 전부 | `payload.transactionId` |
| `recurring_payment` | `merchant_normalized` | 그 가맹점의 거래 전부 (시간순) | 없음 |
| `recurring_price_up` | `merchant_normalized` | 그 가맹점의 거래 전부 (시간순) | `payload` 의 직전·최근 결제 2건 |

- 강조 행은 `--surface-soft` 바탕 + "증거" 표시 (DESIGN)
- 조회에 **`transaction_type = 'expense'` 를 명시하라.** 빠뜨리면 환불이 근거로 딸려 나와 합이 맞지 않는다
- **신호 탐지가 쓰는 필터를 그대로 맞춘다** — 신호는 `category_fallback = false` · `category is not null` · `amount > 0` 인 거래만 보고 판정했다. 근거 표가 그보다 넓으면 **화면의 소계와 `payload` 의 수치가 어긋난다.** 사용자가 검산하려고 여는 화면에서 숫자가 안 맞으면 이 화면의 목적이 정반대로 뒤집힌다
- 이 조회가 복잡해지면 `supabase/migrations/` 에 근거 조회용 RPC 를 추가해도 된다. **그 경우 신호용 RPC 5종(`get_category_monthly_totals` 등)을 수정하지 말고 새 함수를 만들어라** — 기존 신호 테스트가 그 정의에 걸려 있다. 새 함수를 만들었으면 `supabase gen types typescript --local` 로 `src/types/database.ts` 를 갱신한다
- 신호 키(`category_spike` 같은 원시 문자열)를 화면에 노출한다면 `--font-mono` 로 (DESIGN)

#### 5. 권한

**`expired` 에서도 열린다.** 이 화면에는 쓰기 동작이 없다 (ADR-005).

## Acceptance Criteria

```bash
npm run build       # 컴파일 에러 없음
npm run lint        # 경고 0
npm test            # 기존 테스트 전부 통과 (OpenAI 호출 0회)
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - **LLM 호출이 0회인가?**
   - 판정 조건 문구가 `SIGNAL_CONDITION_COPY` 를 그대로 쓰는가? 화면에서 다시 쓰지 않았는가?
   - 판정 수치가 `payload` 값 그대로인가? 새로 계산하거나 없는 값을 채우지 않았는가?
   - 근거 거래 조회가 신호 탐지와 같은 필터(`expense` · `category_fallback = false` · `category is not null` · `amount > 0`)를 쓰는가?
   - 5종 분기가 전부 구현됐는가?
   - 없는 신호 ID 와 `period` 불일치가 404 인가?
   - 신호용 RPC 5종을 수정하지 않았는가?
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? ADR 기술 스택을 벗어나지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/2-review/index.json` 의 step 1 을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step 이 알아야 할 것: 화면 경로, 근거 조회를 RPC 로 했는지 직접 조회로 했는지, 추가한 RPC 이름)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **LLM 을 호출하지 마라.** 이유: 상세 화면은 근거 거래(SQL)와 조건 해설(`thresholds.ts` 상수)로만 만들어진다 (ADR-012). 여기에 문장 생성을 넣으면 "검산할 수 있게 한다"는 이 화면의 목적 자체가 사라진다.
- **판정 조건 문구를 이 화면에 새로 쓰지 마라.** 이유: 임계값을 바꿨을 때 문구가 따라오지 않아 화면이 거짓말을 한다. 문구는 상수 옆에 있다 (ADR-012).
- **`payload` 에 없는 수치를 만들어 채우지 마라.** 이유: 이 제품이 가장 두려워하는 실패가 "틀린 금액을 그럴듯한 문장으로 제시하는 것"이다 (AGENTS.md CRITICAL).
- **근거 거래 범위를 신호 탐지보다 넓게 잡지 마라.** 이유: 표의 소계와 `payload` 수치가 어긋나면 검산하러 온 사용자가 제품을 불신하게 된다.
- **신호용 RPC 5종을 수정하지 마라.** 이유: 이미 통과한 신호 테스트가 그 정의에 걸려 있다. 필요하면 새 함수를 만든다.
- **신호를 다시 탐지하거나 임계값을 화면에서 재정의하지 마라.** 이유: 임계값은 `thresholds.ts` 한 파일에만 둔다 (AGENTS.md CRITICAL).
- **`expired` 에서 이 화면을 막지 마라.** 이유: 읽기는 전부 허용한다 (ADR-005).
- 기존 테스트를 깨뜨리지 마라.
- 커밋하지 마라. execute.py 가 처리한다.
