# Step 1: polar-webhook

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — **"외부 진입점" 절 전체가 이 step 의 단일 출처다.** "`/api/inngest` 와 Polar 웹훅은 로그인 세션 없이 외부에서 호출되고 **service role 로 DB 에 쓴다 — RLS 가 막아주지 않는다**" · "실패는 401 이고 **본문을 파싱하지 않는다**" · "**웹훅은 이벤트 ID 로 멱등 처리한다**"
- `/docs/USER_FLOW.md` — **"상태 머신 2"** 전체. `canceled` 는 즉시 차단이 아니라 `current_period_end` 까지 `active` 와 동일하다. `expired` 는 저장되는 상태가 아니라 계산 결과다
- `/docs/ADR.md` — ADR-005 · ADR-007
- `/AGENTS.md` — **외부에서 호출되는 엔드포인트는 서명 검증을 통과한 요청만 처리할 것. 웹훅은 이벤트 ID 로 멱등 처리** · `subscription_status` 문자열 직접 비교 금지

이전 step 에서 만들어진 아래 파일을 **전부 읽고 시그니처를 확인한 뒤** 작업하라:

- `src/services/polar.ts` — 직전 step 이 만든 래퍼. 설치된 `@polar-sh/sdk` 버전과 **실제 export 목록을 직접 확인하라**
- `src/app/api/billing/checkout/route.ts` — 체크아웃 metadata 에 `user_id` 를 어떤 키로 실었는지 확인하라. **웹훅은 그 키를 읽는다**
- `src/app/api/inngest/route.ts` — **서명 검증을 통과한 요청만 처리하는 기존 외부 진입점의 형태**를 참고하라
- `src/services/supabase-service-role.ts` — `createServiceRoleClient()`
- `src/lib/entitlement.ts` — `SubscriptionStatus` enum 값
- `src/middleware.ts` — 매처가 `/api` 를 제외한다. **웹훅 경로가 미들웨어에 막히지 않는지 확인하라**
- `supabase/migrations/20260817072100_rls.sql` — 기존 RLS 정책 작성 방식

## 작업

### 1. 마이그레이션 — `processed_webhook_events`

새 파일 `supabase/migrations/<타임스탬프>_processed_webhook_events.sql`:

```sql
create table public.processed_webhook_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

alter table public.processed_webhook_events enable row level security;
-- 정책을 만들지 않는다. service role 만 접근한다.
```

- **RLS 를 켜되 정책을 만들지 마라.** 사용자 데이터 테이블이 아니라 `user_id` 기준 정책이 성립하지 않고, 접근 주체는 웹훅 라우트(service role)뿐이다. RLS 를 끄면 anon 키로 읽을 수 있게 된다
- 적용 후 `supabase gen types typescript --local` 결과를 `src/types/database.ts` 에 다시 저장한다

### 2. `POST /api/webhooks/polar`

**`route.ts` 는 TDD Guard 검사 대상이다. `route.test.ts` 를 먼저 작성하라.**

처리 순서를 이 순서대로 지켜라:

1. **raw body 를 문자열로 읽는다.** `request.text()` 다. **`request.json()` 을 먼저 부르지 마라** — 서명은 바이트 그대로에 대해 계산되므로 파싱·재직렬화를 거치면 검증이 깨진다
2. `POLAR_WEBHOOK_SECRET` 으로 **서명을 검증한다.** 실패하면 **401 을 반환하고 본문을 파싱하지 않는다.** 검증이 없으면 `user_id` 를 담아 POST 하는 것만으로 결제 없이 구독이 켜진다 (ARCHITECTURE "외부 진입점")
   - Polar 웹훅은 Standard Webhooks 규격이다. 설치된 `@polar-sh/sdk` 가 제공하는 검증 유틸을 쓰되 **버전의 실제 export 를 확인하고 써라.** 기억으로 API 이름을 지어내지 마라
3. 검증을 통과한 뒤에만 본문을 파싱한다
4. **멱등 처리** — `processed_webhook_events` 에 이벤트 ID 를 **INSERT 해 보고, 충돌(unique violation)이면 이미 처리한 것으로 보고 200 을 반환하고 끝낸다**
   - **`select` 로 존재를 확인한 뒤 `insert` 하지 마라.** 이유: 같은 이벤트가 동시에 두 번 도착하면 두 요청이 모두 "없음"을 보고 둘 다 처리한다. 재전송이 전제인 경로라 실제로 발생하고, 그러면 `current_period_end` 가 두 번 연장된다
   - 이후 처리가 실패하면 **방금 넣은 event row 를 지우고 5xx 를 반환한다.** 지우지 않으면 재전송이 무시되어 결제가 반영되지 않는다
5. **`user_id` 는 이벤트의 `metadata` 에서 읽는다** (체크아웃이 실은 값, ADR-007). 없으면 400 이다. **이메일로 계정을 추정하지 마라**
6. service role 클라이언트로 `profiles` 를 갱신한다

### 3. 이벤트별 상태 매핑

`profiles.subscription_status` 는 **결제 사실만** 담는다(`trialing` · `active` · `canceled`). **`expired` 라는 값을 쓰지 마라 — enum 에 없고, 만료는 `entitlement.ts` 가 매 요청 계산하는 결과다** (USER_FLOW "상태 머신 2").

| 이벤트 | `subscription_status` | 함께 갱신 |
|---|---|---|
| 구독 생성·활성화 | `active` | `current_period_end`, `polar_customer_id` |
| 구독 갱신(결제 성공) | `active` | `current_period_end` |
| 구독 해지 예약 | `canceled` | `current_period_end` **를 그대로 유지한다** |
| 해지 취소 | `active` | `current_period_end` |
| 구독 종료·회수 | `canceled` | `current_period_end` 를 이벤트가 알려주는 종료 시각으로 |

- **해지는 즉시 차단이 아니다.** `canceled` + `current_period_end` 가 미래이면 `evaluateEntitlement` 가 `active` 와 같은 권한을 준다 (USER_FLOW "상태 머신 2"). 해지 이벤트에서 `current_period_end` 를 지우거나 과거로 바꾸지 마라 — 결제한 기간을 빼앗는 것이 된다
- **`trial_started_at` 을 웹훅에서 건드리지 마라.** 체험 시작은 가입 시점의 사실이고 결제와 무관하다
- 정확한 Polar 이벤트 타입 문자열은 **설치된 SDK 의 타입 정의에서 확인하라.** 모르는 이벤트 타입은 기록만 하고 200 으로 무시한다 — 400 을 돌려주면 Polar 가 계속 재전송한다

### 4. 테스트 (구현보다 먼저)

- 서명이 틀린 요청이 **401** 이고, **본문 파싱 함수가 호출되지 않는다**
- 같은 이벤트 ID 를 두 번 보내면 **두 번째는 `profiles` 를 갱신하지 않는다**
- 해지 이벤트가 `current_period_end` 를 **지우지 않는다**
- `metadata` 에 `user_id` 가 없으면 400 이고 `profiles` 를 건드리지 않는다
- 처리 실패 시 `processed_webhook_events` row 가 남지 않는다
- 알 수 없는 이벤트 타입은 200 이다

## Acceptance Criteria

```bash
supabase db reset   # 마이그레이션 적용 성공 (로컬)
npm run build       # 컴파일 에러 없음
npm run lint        # 경고 0
npm test            # 웹훅 라우트 테스트 포함 전부 통과 (실제 Polar 호출 0회)
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - raw body 로 서명을 검증하는가? 검증 전에 파싱하지 않는가?
   - 검증 실패가 401 인가?
   - 멱등 판정이 **INSERT 충돌** 인가? `select` 후 `insert` 가 아닌가?
   - 처리 실패 시 event row 를 정리하는가?
   - `user_id` 를 metadata 에서만 읽는가? 이메일 추정이 없는가?
   - 해지가 `current_period_end` 를 유지하는가?
   - `subscription_status` 에 `expired` 를 쓰지 않는가?
   - `processed_webhook_events` 에 RLS 가 켜져 있고 정책이 없는가?
   - 미들웨어가 웹훅 경로를 막지 않는가?
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? ADR 기술 스택을 벗어나지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/3-billing/index.json` 의 step 1 을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step 이 알아야 할 것: 웹훅 경로, 검증에 쓴 SDK API, 처리하는 이벤트 타입 목록, 새 테이블명, 필요한 환경변수)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단. **단 Polar 웹훅 시크릿이 없다는 것은 blocked 사유가 아니다** — 테스트는 시크릿을 주입해 검증한다

## 금지사항

- **서명 검증을 통과하지 않은 요청의 본문을 파싱하거나 처리하지 마라.** 이유: 이 경로는 service role 로 DB 에 쓰므로 RLS 가 막아주지 않는다. 검증이 없으면 `user_id` 를 담아 POST 하는 것만으로 결제 없이 구독이 켜진다 (AGENTS.md CRITICAL).
- **`select` 로 중복을 확인한 뒤 `insert` 하지 마라.** 이유: 동시 재전송에 두 요청이 모두 통과해 `current_period_end` 가 두 번 연장된다.
- **해지 시 `current_period_end` 를 지우거나 과거로 바꾸지 마라.** 이유: `canceled` 는 기간 내에는 `active` 와 같은 권한이다. 결제한 기간을 빼앗게 된다 (USER_FLOW "상태 머신 2").
- **`subscription_status` 에 `expired` 를 저장하지 마라.** 이유: enum 에 없고, 만료는 저장되는 상태가 아니라 `entitlement.ts` 의 계산 결과다.
- **체험 만료를 내리는 cron 을 만들지 마라.** 이유: 실행 지연만큼 공짜 이용 구간이 생기고 크론이 죽으면 전원이 무제한이 된다 (ARCHITECTURE "백그라운드").
- **이메일로 계정을 추정하거나 병합하지 마라.** 이유: 다른 구글 계정으로 로그인한 사용자를 처리할 방법이 없다 (ADR-007).
- **웹훅에서 `trial_started_at` 을 건드리지 마라.** 이유: 체험 시작은 가입 시점의 사실이다.
- **알 수 없는 이벤트에 4xx 를 돌려주지 마라.** 이유: Polar 가 계속 재전송한다.
- **계정 설정 화면·해지 포털 UI 를 만들지 마라.** 이유: 다음 step 의 몫이다.
- 기존 테스트를 깨뜨리지 마라.
- 커밋하지 마라. execute.py 가 처리한다.
