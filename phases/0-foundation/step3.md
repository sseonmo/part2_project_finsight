# Step 3: auth

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/USER_FLOW.md` — **"상태 머신 2" 와 "권한 매트릭스" 가 이 step 의 단일 출처다.** "화면" 표, S1 · S18 · S26 도 읽어라
- `/docs/ADR.md` — ADR-005(만료는 쓰기만 막는다) · ADR-007(결제는 로그인 이후)
- `/docs/ARCHITECTURE.md` — "데이터 모델"(`profiles`), "상태 관리", "외부 진입점"
- `/AGENTS.md` — entitlement · RLS 관련 CRITICAL 규칙

이전 step 에서 만들어진 파일:

- `supabase/migrations/*.sql` — `profiles` 테이블의 실제 컬럼명과 enum 값
- `src/types/database.ts` — 생성된 타입
- `src/app/layout.tsx` · `src/app/(marketing)/page.tsx` · `src/components/Button.tsx`
- `src/lib/categories.ts`

## 작업

### 1. `src/services/supabase.ts` — 클라이언트 3종

`@supabase/ssr` 로 Next 15 App Router 에 맞는 클라이언트를 만든다. **테스트를 먼저 써라** (`src/services/` 는 TDD Guard 검사 대상이다).

```ts
export function createBrowserClient(): SupabaseClient<Database>
export function createServerClient(): Promise<SupabaseClient<Database>>   // cookies() 기반, RSC·Route Handler 용
export function createServiceRoleClient(): SupabaseClient<Database>       // RLS 우회
```

- **`createServiceRoleClient` 은 `SUPABASE_SERVICE_ROLE_KEY` 를 읽는다.** 이 함수가 클라이언트 번들에 들어가면 키가 브라우저로 나간다. 파일 최상단에 `import 'server-only'` 를 두거나, service role 만 별도 모듈로 분리해 서버 전용임을 강제해라
- 환경변수가 없으면 **모듈 로드 시점이 아니라 호출 시점에** 명확한 에러를 던져라. 이유: 모듈 로드 시 던지면 이 모듈을 import 하는 모든 테스트가 env 없이는 실행되지 않는다

### 2. `src/lib/entitlement.ts` — 권한 판정 (이 step 의 핵심)

**테스트를 먼저 써라.** `src/lib/entitlement.test.ts` 가 먼저 존재해야 한다.

```ts
export type SubscriptionStatus = 'trialing' | 'active' | 'canceled'

export type EntitlementInput = {
  subscriptionStatus: SubscriptionStatus
  trialStartedAt: Date | null
  currentPeriodEnd: Date | null
  now: Date                    // 주입받는다. 함수 안에서 new Date() 를 부르지 마라
}

export type Entitlement = {
  state: 'trialing' | 'active' | 'expired'
  canRead: boolean             // 항상 true
  canWrite: boolean
  trialEndsAt: Date | null     // 만료 2일 전 예고 배너가 읽는다
}

export function evaluateEntitlement(input: EntitlementInput): Entitlement
```

USER_FLOW "상태 머신 2" 의 계산 규칙을 그대로 옮긴다:

- `trialing` + `trial_started_at + 7일 > now` → 이용 가능
- `trialing` + 7일 지남 → `expired`
- `active` → 이용 가능
- `canceled` + `current_period_end > now` → **`active` 와 동일한 권한**
- `canceled` + 기간 지남 → `expired`

반드시 지킬 것:

- **`subscription_status` 문자열을 직접 비교해 권한을 판정하는 코드를 이 파일 밖 어디에도 두지 마라.** 이유: 상태와 권한이 어긋나는 지점이 둘(`canceled` 기간 내, `trialing` 만료 후)이라, 직접 비교하는 순간 결제한 사용자가 차단되거나 만료자가 통과한다 (USER_FLOW · AGENTS.md CRITICAL)
- **읽기는 어떤 상태에서도 막지 않는다.** `canRead` 는 항상 `true` 다 (ADR-005)
- `now` 를 인자로 받는다. 시각을 함수 안에서 만들면 테스트가 시계에 의존한다
- `trial_started_at` 이 NULL 인 `trialing` 은 방어적으로 `expired` 로 판정한다

`src/lib/entitlement.test.ts` 는 USER_FLOW "권한 매트릭스" 표를 그대로 케이스로 옮긴다. 4개 상태 × (열람 · 신규 업로드 · 리포트 생성 · 분류 수정 · 기존 리포트 열람 · 반복 지출 목록) 을 전부 덮고, **경계값**(체험 7일째 직전/직후, `current_period_end` 직전/직후)을 포함한다.

### 3. `src/middleware.ts` — 로그인 게이트

**테스트를 먼저 써라** (`src/middleware.test.ts`).

- `(app)` 그룹 라우트(`/dashboard/**`, `/settings`)는 세션이 없으면 랜딩(`/`)으로 보낸다
- **원래 가려던 경로를 쿼리로 실어 보낸다** (S26). 로그인 후 무조건 `/dashboard` 로 보내지 마라
- 랜딩(`/`)에 로그인 상태로 들어오면 `/dashboard` 로 보낸다 (USER_FLOW "화면" 표)
- `/api/**` 와 정적 자산은 미들웨어 매처에서 제외한다. 특히 **`/api/inngest` 는 세션 없이 외부에서 호출되므로 미들웨어가 막으면 안 된다** (ARCHITECTURE "외부 진입점")
- 미들웨어에서 권한(entitlement)을 판정하지 마라. 로그인 여부만 본다 — 쓰기 게이트는 각 쓰기 경로가 건다

### 4. `src/app/auth/callback/route.ts` — OAuth 콜백

**테스트를 먼저 써라** (`src/app/auth/callback/route.test.ts`). Next 라우팅 예외 목록에 `route` 는 들어 있지 않아 TDD Guard 가 검사한다.

- 인가 코드를 세션으로 교환한다
- **최초 로그인이면 `profiles` 를 만들고 `trial_started_at` 을 지금으로 넣는다** (S1). 재로그인 시 `trial_started_at` 을 덮어쓰면 체험이 무한 연장된다 — 삽입은 충돌 시 아무것도 하지 않아야 한다
- 복귀 경로는 쿼리로 받은 원래 경로, 없으면 `/dashboard`
- **복귀 경로는 `/` 로 시작하는 내부 경로만 허용한다.** `//evil.com` 과 `https://` 로 시작하는 값을 거부해라. 이유: 검증 없이 리다이렉트하면 오픈 리다이렉트가 된다
- 코드 교환에 실패하면 랜딩으로 보내고 사람이 읽을 수 있는 사유를 보여준다

### 5. 화면 두 곳

- `src/app/(marketing)/page.tsx` — 플레이스홀더였던 "구글로 시작하기" 를 실제 Google OAuth 로 연결한다. 미들웨어가 실어 보낸 복귀 경로가 있으면 `redirectTo` 에 실어 보낸다
- `src/app/(app)/dashboard/page.tsx` — **placeholder 한 장.** 로그인한 사용자의 이메일과 `evaluateEntitlement` 결과(state · 체험 종료일)를 텍스트로 보여주는 정도면 충분하다. 서버 컴포넌트로 만든다

### 6. `src/app/(app)/layout.tsx`

세션을 확인하고 자식을 그대로 렌더하는 **최소 레이아웃**만 둔다.

## Acceptance Criteria

```bash
npm run build   # 컴파일 에러 없음
npm run lint    # 경고 0
npm test        # entitlement · middleware · callback 테스트 포함 전부 통과
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `subscription_status` 를 직접 비교하는 코드가 `entitlement.ts` 밖에 없는가?
   - service role 클라이언트가 클라이언트 컴포넌트에서 import 될 수 없는가?
   - 미들웨어 매처가 `/api/inngest` 를 건드리지 않는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-foundation/index.json` 의 step 3 을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step 이 알아야 할 것: 클라이언트 팩토리 이름, `evaluateEntitlement` 시그니처, 미들웨어 매처 범위)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **앱 셸(사이드바 · 헤더 · 월 선택 칩 · 테마 토글 · 읽기 전용 배너)을 만들지 마라.** 이유: 셸은 대시보드 화면들과 함께 만들어야 문구와 배치가 어긋나지 않아 다음 phase 의 첫 step 으로 분리했다. 이 step 의 `/dashboard` 는 로그인이 되는지 확인하는 placeholder 다.
- **결제 · 체크아웃 · Polar 관련 코드를 만들지 마라.** 이유: ADR-007 의 체크아웃은 다음 phase 다. 이 step 은 `subscription_status` 를 **읽기만** 한다.
- **`profiles` 를 service role 로 만들지 마라.** 이유: 사용자 세션으로 삽입하면 RLS 가 그대로 검증된다. service role 을 쓰면 RLS 정책의 오류가 이 경로에서 드러나지 않는다.
- **로그인 전용 화면(`/login`)을 만들지 마라.** 이유: USER_FLOW "화면" 표에 없다. 진입점은 랜딩의 버튼 하나다.
- **체험 만료를 cron 이나 DB 컬럼으로 처리하지 마라.** 이유: 매 요청 계산이 결정이다 (ARCHITECTURE "백그라운드"). 실행 지연만큼 공짜 구간이 생기고 크론이 죽으면 전원이 무제한이 된다.
- 기존 테스트를 깨뜨리지 마라.
- 커밋하지 마라. execute.py 가 처리한다.
