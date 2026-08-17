# Step 0: billing-checkout

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ADR.md` — **ADR-007 전문이 이 step 의 단일 출처다.** "체크아웃 생성 시 `user_id` 를 metadata 에 실어야 웹훅이 도착했을 때 어느 계정에 권한을 켤지 알 수 있다"
- `/docs/PRD.md` — "수익 구조": **월 4,900원 / 연 49,000원, Polar 테스트 모드**, 7일 무료 체험
- `/docs/USER_FLOW.md` — S7(결제) · S19(체크아웃 중 이탈) · S20(결제했는데 웹훅 지연 — 복귀 페이지에서 **최대 30초 폴링**) · "화면" 표의 `/dashboard/billing` 행과 **"요금제는 앱 안에도 화면을 둔다"** 문단
- `/docs/DESIGN.md` — "컴포넌트"(`PricingCard`: `standard`·`featured` / `PillTabs`: 40px) · "화면별 메모"의 요금제 행(카드 2장(월/연) + 절약액 비교 문장 + "결제하지 않으면 어떻게 되나요" 2열 패널) · "앱 셸"(요금제 최대 폭 860px)
- `/docs/ARCHITECTURE.md` — "외부 진입점" · 디렉토리 구조(외부 API 래퍼는 `src/services/`)
- `/AGENTS.md` — 외부 API 호출은 라우트 핸들러와 Inngest 함수에서만. 클라이언트 컴포넌트에서 직접 호출 금지

이전 phase 에서 만들어진 아래 파일을 **전부 읽고 시그니처를 확인한 뒤** 작업하라:

- `src/lib/entitlement.ts` — `evaluateEntitlement` · `SubscriptionStatus = "trialing" | "active" | "canceled"`
- `src/lib/session.ts` — `getSessionContext()`
- `src/components/AppHeader.tsx` — `expired` 일 때 "결제하고 계속 쓰기" 버튼이 `/dashboard/billing` 으로 보낸다
- `src/components/ReadOnlyBanner.tsx` — "요금제 보기" 링크도 여기로 온다
- `src/components/Button.tsx` · `Badge.tsx`
- `src/services/openai.ts` — **외부 API 래퍼의 작성 방식(환경변수 읽기·클라이언트 생성·에러 처리)을 그대로 본떠라**
- `supabase/migrations/20260817072000_init.sql` — `profiles.polar_customer_id` · `current_period_end` · `subscription_status`

## 작업

### 1. Polar SDK 설치

`npm install @polar-sh/sdk` 로 의존성을 추가한다. **설치한 버전의 실제 export 를 직접 확인하고 그에 맞춰 코드를 쓰라** — 기억에 의존해 API 이름을 지어내지 마라.

### 2. `src/services/polar.ts`

```ts
export type CheckoutPlan = "monthly" | "yearly";

export async function createCheckoutSession(input: {
  plan: CheckoutPlan;
  userId: string;
  customerEmail: string | null;
  successUrl: string;
}): Promise<{ checkoutUrl: string }>;

export async function createCustomerPortalSession(input: {
  polarCustomerId: string;
}): Promise<{ portalUrl: string }>;
```

- 환경변수는 `POLAR_ACCESS_TOKEN` · `POLAR_PRODUCT_ID_MONTHLY` · `POLAR_PRODUCT_ID_YEARLY` · `POLAR_SERVER`(`sandbox` | `production`) 다. **읽는 곳은 이 파일 하나뿐이다**
- **`metadata` 에 `user_id` 를 반드시 싣는다.** 웹훅이 도착했을 때 어느 계정에 권한을 켤지 아는 유일한 수단이다 (ADR-007). 이메일로 계정을 추정하는 코드를 만들지 마라
- `server-only` 를 import 한다. **클라이언트 컴포넌트에서 이 모듈을 부를 수 없어야 한다** (AGENTS.md CRITICAL)
- 포털 함수는 다음 step 들(계정 설정)이 쓴다. 여기서는 만들기만 한다
- **테스트에서 SDK 를 모킹하라.** 실제 Polar API 를 호출하는 테스트를 만들지 마라

### 3. `POST /api/billing/checkout`

- 로그인 확인 → `plan`(`monthly` | `yearly`) 검증 → `createCheckoutSession` → `{ checkoutUrl }` 반환
- **`user_id` 는 서버 세션에서 가져온다. 요청 본문에서 받지 마라** — 받으면 남의 계정에 구독을 붙일 수 있다
- `successUrl` 은 서버가 만든다(`/dashboard/billing?checkout=success`). 클라이언트가 준 URL 로 리다이렉트하지 마라 — 오픈 리다이렉트가 된다
- 이미 `active` 인 사용자는 체크아웃을 새로 만들지 않고 409 로 안내한다. **판정은 `evaluateEntitlement` 로 하고 `subscription_status` 를 직접 비교하지 마라** (AGENTS.md CRITICAL)
- **`route.ts` 는 TDD Guard 검사 대상이다.** `route.test.ts` 를 **먼저** 작성하라 — 비로그인 401, 잘못된 plan 400, metadata 에 세션의 `user_id` 가 실림, 본문의 `userId` 가 무시됨

### 4. 컴포넌트

- **`PricingCard.tsx`** — `variant: "standard" | "featured"`. 요금제 이름 · 금액 · 기간 · 기능 목록 · CTA
- **`PillTabs.tsx`** — 높이 40px, 월/연 전환. 트랙은 `--surface`, 선택 항목은 `--canvas`
- 둘 다 `src/components/` 이므로 TDD Guard 면제지만, `PricingCard` 의 렌더 테스트를 하나 남겨라

### 5. `/dashboard/billing` 화면

최대 폭 860px.

- **카드 2장** — 월 4,900원 / 연 49,000원 (PRD "수익 구조"). `PillTabs` 로 전환하고 연간 카드를 `featured` 로
- **절약액 비교 문장** — 연 49,000원은 월 4,900원 × 12 = 58,800원 대비 9,800원 싸다. **이 숫자를 코드에서 계산하라.** 문장에 하드코딩하면 가격이 바뀔 때 화면이 거짓말을 한다
- **"결제하지 않으면 어떻게 되나요" 2열 패널** — 권한 매트릭스를 사람 말로: 대시보드·AI 리뷰·리포트·반복 지출 목록은 **계속 볼 수 있고**, 새 업로드·리포트 생성·분류 수정이 막힌다 (ADR-005). **"데이터가 삭제된다" 같은 사실이 아닌 압박을 쓰지 마라**
- 현재 상태를 배지로 보여준다 — 체험 중이면 남은 일수(`entitlement.trialEndsAt`), `expired` 면 읽기 전용임을 밝힌다
- **복귀 폴링** (S20) — `?checkout=success` 로 돌아오면 "결제를 확인하는 중" 을 띄우고 **최대 30초** 동안 프로필을 폴링한다. 초과하면 **"곧 반영됩니다. 새로고침해 주세요"** 로 끝낸다. 무한 폴링하지 마라
  - 폴링이 필요한 이유: 권한을 켜는 것은 웹훅이고(다음 step), 웹훅은 리다이렉트보다 늦게 도착할 수 있다
  - **폴링 결과로 권한을 켜지 마라.** 화면은 서버가 이미 갱신한 상태를 읽을 뿐이다
- 체크아웃 중 이탈은 아무 일도 일어나지 않는다 (S19). 별도 처리를 만들지 마라

### 6. 환경변수 문서화

`.env.example`(없으면 만든다)에 이 step 이 추가한 변수를 주석과 함께 적는다. **실제 키 값을 저장소에 커밋하지 마라.**

**키가 없어도 이 step 은 완료할 수 있다.** 빌드·린트·테스트는 SDK 를 모킹하므로 통과한다. **키가 없다는 이유로 `blocked` 로 만들지 마라** — 실제 키는 배포 시점에 필요하고 그 검증은 이 phase 의 마지막 step 이 맡는다.

## Acceptance Criteria

```bash
npm run build       # 컴파일 에러 없음
npm run lint        # 경고 0
npm test            # 체크아웃 라우트 테스트 포함 전부 통과 (실제 Polar 호출 0회)
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 체크아웃 metadata 에 **서버 세션의** `user_id` 가 실리는가? 본문 값을 쓰지 않는가?
   - `successUrl` 을 서버가 만드는가?
   - Polar 호출이 `src/services/polar.ts` 를 거치고 클라이언트 컴포넌트에서 직접 호출되지 않는가?
   - `subscription_status` 문자열을 직접 비교하지 않는가?
   - 절약액이 코드에서 계산되는가?
   - 복귀 폴링이 30초에서 멈추는가? 폴링이 권한을 켜지 않는가?
   - 요금제 안내가 "읽기는 계속 허용"을 정확히 말하는가?
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? ADR 기술 스택을 벗어나지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/3-billing/index.json` 의 step 0 을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step 이 알아야 할 것: `src/services/polar.ts` 의 함수 시그니처, 설치한 SDK 버전과 쓴 API, 환경변수 이름, 체크아웃 라우트 경로, metadata 키 이름)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단. **단 Polar 키가 없다는 것은 blocked 사유가 아니다**

## 금지사항

- **비로그인 결제 경로를 만들지 마라.** 이유: 체크아웃 metadata 에 `user_id` 를 실을 수 없어 웹훅이 어느 계정을 켤지 알 수 없고, 이메일로 계정을 추정·병합하는 로직이 필요해진다 (ADR-007).
- **`user_id` 를 요청 본문에서 받지 마라.** 이유: 남의 계정에 구독을 붙일 수 있다.
- **클라이언트가 준 URL 로 리다이렉트하지 마라.** 이유: 오픈 리다이렉트가 된다.
- **웹훅 처리·구독 상태 갱신 코드를 만들지 마라.** 이유: 다음 step 의 몫이다. **이 step 의 어떤 코드도 `profiles.subscription_status` 를 쓰지 않는다** — 그것이 웹훅 검증을 우회하는 경로가 된다.
- **폴링 결과로 권한을 켜지 마라.** 이유: 권한을 켜는 유일한 경로는 서명 검증을 통과한 웹훅이다. 클라이언트가 "결제했다"고 말하는 것으로 구독이 켜지면 결제 없이 구독을 얻을 수 있다.
- **`subscription_status` 문자열을 직접 비교하지 마라.** 이유: `canceled` 는 기간 내에는 `active` 와 같은 권한이다 (AGENTS.md CRITICAL).
- **랜딩의 가격 섹션에서 체크아웃을 열지 마라.** 이유: 랜딩 CTA 는 로그인으로 보낸다 (ADR-007).
- **가격을 여러 곳에 하드코딩하지 마라.** 이유: 금액이 바뀔 때 화면과 실제 결제가 어긋난다.
- 기존 테스트를 깨뜨리지 마라.
- 커밋하지 마라. execute.py 가 처리한다.
