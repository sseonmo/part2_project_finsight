# Step 3: transactions

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/USER_FLOW.md` — **S4(분류 수정은 가맹점 단위로 전파) · S12d(환불·입금) · S37(분류를 고친 뒤) · 권한 매트릭스와 "거래 목록에서는 화면이 아니라 동작을 잠근다" 문단이 이 step 의 단일 출처다**
- `/docs/DESIGN.md` — "화면별 메모"의 거래 목록 행(검색 pill + 카테고리 필터 칩 + 건수·합계, 표 5열, 인라인 `select`) · "타이포그래피"(금액은 `tabular-nums` 우측 정렬) · "다크 모드"(`select option` 규칙)
- `/docs/ARCHITECTURE.md` — "패턴"(집계는 전부 SQL) · "데이터 모델"(조회 시 카테고리는 `user_category_overrides` → `merchant_categories` 순) · "가맹점 분류"
- `/docs/ADR.md` — ADR-005(쓰기만 막는다)
- `/AGENTS.md` — **전역 캐시 `merchant_categories` 에 사용자의 수정을 반영하지 말 것**

이전 step 에서 만들어진 아래 파일을 **전부 읽고 시그니처를 확인한 뒤** 작업하라:

- `src/lib/session.ts` · `src/components/AppHeader.tsx` · `Badge.tsx` (step 0)
- `src/lib/dashboard/queries.ts` 와 `supabase/migrations/<...>_dashboard_aggregates.sql` (step 2) — **카테고리 결정 방식(override LEFT JOIN)을 이 step 도 그대로 따른다**
- `src/lib/categories.ts` — `CATEGORIES` · `CATEGORY_TOKENS` · `toCategory`
- `src/lib/merchant.ts` — `normalizeMerchant`
- `src/lib/entitlement.ts`
- `supabase/migrations/20260817072000_init.sql` — `transactions` · `user_category_overrides` · `merchant_categories` 의 실제 컬럼
- `src/types/database.ts`

## 작업

### 1. 마이그레이션 — 거래 목록 조회 RPC 2종

새 파일 `supabase/migrations/<타임스탬프>_transaction_list.sql`.

**건수와 합계를 클라이언트에서 세지 마라.** 검색어·카테고리 필터가 걸린 목록의 합계를 현재 페이지에서 계산하면 페이지 밖의 거래가 빠져 틀린 숫자가 나온다. 집계는 전부 SQL 에서 한다 (ARCHITECTURE "패턴").

```sql
create or replace function public.get_transactions_page(
  p_user_id uuid,
  p_period date,
  p_search text,                                -- null 이면 검색 없음
  p_categories public.transaction_category[],   -- null 이거나 빈 배열이면 전체
  p_limit integer,
  p_offset integer
) returns table (
  id uuid, transacted_on date, merchant_raw text, merchant_normalized text,
  category public.transaction_category,          -- override 가 반영된 값
  category_overridden boolean,
  amount bigint, transaction_type public.transaction_type
)

create or replace function public.get_transactions_summary(
  p_user_id uuid, p_period date, p_search text,
  p_categories public.transaction_category[]
) returns table (
  transaction_count bigint, expense_total bigint,
  refund_total bigint, deposit_total bigint
)
```

- **카테고리는 `user_category_overrides` → `transactions.category` → `'기타'` 순으로 결정하고, 필터(`p_categories`)도 그 결정된 값에 건다.** 원본 컬럼에 필터를 걸면 사용자가 방금 고친 거래가 필터 결과에서 사라진다
- 검색은 `merchant_raw` 와 `merchant_normalized` 양쪽에 걸어라 — 사용자는 명세서에 찍힌 이름으로 검색한다
- **`transaction_type` 을 필터하지 마라.** 이 목록은 환불·입금을 포함해 전부 보여준다. 대신 요약은 `expense_total` · `refund_total` · `deposit_total` 을 따로 낸다. **환불을 지출 합계에서 빼지 마라** — "3월 지출 30만원 / 환불 15만원"으로 나란히 보인다 (S12d)
- 정렬은 `transacted_on` 내림차순, 동률이면 `id`
- 적용 후 `supabase gen types typescript --local` 결과를 `src/types/database.ts` 에 다시 저장한다

### 2. `POST /api/transactions/category` — 분류 수정

```
요청: { merchantNormalized: string, category: Category }
```

- **거래 id 가 아니라 `merchant_normalized` 를 받는다.** 분류 수정은 가맹점 단위이기 때문이다. 거래 한 건씩 고치게 하면 사용자가 같은 작업을 수십 번 반복한다 (S4)
- `user_category_overrides` 에 `(user_id, merchant_normalized)` 로 upsert 한다
- **`merchant_categories`(전역 캐시)를 절대 쓰지 마라.** 이유: 한 사용자의 분류 취향이 전체 사용자에게 전파된다 (AGENTS.md CRITICAL). 이 라우트는 `user_category_overrides` 한 테이블만 건드린다
- `category` 는 **`CATEGORIES` 10종 안의 값만 허용**하고 벗어나면 400 이다
- **entitlement 쓰기 게이트를 건다.** 분류 수정은 비용이 들지 않지만 쓰기이므로 `expired` 에서 막는다 (ADR-005). `evaluateEntitlement` 만 쓰고 `subscription_status` 를 직접 비교하지 마라
- **신호를 다시 계산하지 마라.** 신호는 업로드 시점에만 만들어진다 (S37)
- **`route.ts` 는 TDD Guard 검사 대상이다.** `route.test.ts` 를 먼저 작성하라 — 만료 사용자 403, enum 밖 카테고리 400, `merchant_categories` 에 쓰지 않음

### 3. `/dashboard/transactions` 화면

- **표 5열**: 날짜 · 가맹점 · 카테고리 · 금액 · 상태
  - 날짜·금액은 `tabular-nums` 우측 정렬. 금액은 천 단위 쉼표 + `원`, 소수점 없음
  - 가맹점은 `merchant_raw` 를 보여주되 정규화 이름이 다르면 보조 설명으로 함께 둔다 — 수정이 정규화 이름 단위로 전파되므로 사용자가 그 범위를 알 수 있어야 한다
  - 상태 열은 `transaction_type` 이다: 지출 / **환불** / **입금**. 환불·입금은 배지로 구분한다 (S12d)
  - 카테고리 열은 **인라인 `select`** 다. 앞에 카테고리 색 점을 둔다
- **검색 pill** — 가맹점 검색. **카테고리 필터 칩** — `CATEGORIES` 10종 중 있는 것만. **건수·합계** — `get_transactions_summary` 결과
- 검색어·필터·페이지는 URL 검색 파라미터로 들고 서버에서 조회한다. **클라이언트 전역 상태로 들지 마라**
- **`expired` 에서 화면은 열리고 동작만 잠긴다** (USER_FLOW 권한 매트릭스): 목록·검색·필터는 그대로 쓰고 **카테고리 `select` 만 `disabled`** 다. 화면 자체를 막거나 사이드바에서 숨기지 마라
- 수정에 성공하면 **같은 가맹점의 다른 행도 함께 갱신된다** (S4). 서버 데이터를 다시 읽어 반영하고, 저장 완료는 `Badge variant="success"` 로 알린다
- 안내 문구는 **"분류를 고치면 대시보드가 다시 계산됩니다"** 로 좁혀 적는다. **"AI 리뷰가 다시 계산됩니다" 같은 문구를 쓰지 마라** — MVP 가 지키지 못하는 약속이다 (S37)
- 다크 모드에서 `select` 의 `option` 배경은 `globals.css` 에 이미 규칙이 있다. 컴포넌트에서 다시 칠하지 마라

## Acceptance Criteria

```bash
supabase db reset   # 마이그레이션 적용 성공 (로컬)
npm run build       # 컴파일 에러 없음
npm run lint        # 경고 0
npm test            # 분류 수정 라우트 테스트 포함 전부 통과
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 분류 수정이 `user_category_overrides` 에만 쓰고 `merchant_categories` 를 건드리지 않는가?
   - 수정 단위가 가맹점(`merchant_normalized`)인가? 거래 한 건이 아닌가?
   - 카테고리 필터가 override 반영 후의 값에 걸리는가?
   - 요약이 환불·입금을 지출에서 빼지 않고 나란히 내는가?
   - `expired` 에서 화면이 열리고 `select` 만 비활성인가?
   - 분류 수정 시 신호를 재계산하지 않는가?
   - 건수·합계를 SQL 에서 계산하는가?
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? ADR 기술 스택을 벗어나지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/1-dashboard/index.json` 의 step 3 을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step 이 알아야 할 것: 새 RPC 2종 이름과 시그니처, 분류 수정 라우트 경로와 요청 형태, URL 파라미터 규약)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **사용자의 분류 수정을 `merchant_categories` 에 반영하지 마라.** 이유: 전역 캐시라 한 사람의 취향이 전체 사용자에게 전파된다 (AGENTS.md CRITICAL).
- **`merchant_categories` 에 `user_id`·금액·날짜 컬럼을 추가하지 마라.** 이유: 같은 규칙의 반대편이다. 이 테이블에는 가맹점명과 카테고리만 있다.
- **거래 한 건 단위로만 카테고리를 고치게 만들지 마라.** 이유: 사용자가 같은 작업을 수십 번 반복한다 (S4).
- **`expired` 에서 화면을 막지 마라.** 이유: 만료는 쓰기만 막는다. 목록과 검색은 열려 있고 `select` 만 비활성이다 (ADR-005).
- **분류 수정 후 신호를 재계산하지 마라.** 이유: 신호는 업로드 시점에만 만들어진다 (S37).
- **완료된 job 의 컬럼 매핑을 고치는 UI 를 만들지 마라.** 이유: MVP 에 그 경로는 없다. 잘못 읽힌 업로드의 복구는 삭제 후 재업로드다 (ADR-001).
- **LLM 을 호출하지 마라.** 이유: 분류 수정은 사용자의 선택을 저장하는 것이지 다시 분류하는 것이 아니다.
- 기존 테스트를 깨뜨리지 마라.
- 커밋하지 마라. execute.py 가 처리한다.
