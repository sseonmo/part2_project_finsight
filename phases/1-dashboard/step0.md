# Step 0: app-shell

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/DESIGN.md` — **"앱 셸"·"컴포넌트"·"다크 모드"·"브레이크포인트" 가 이 step 의 단일 출처다.** 사이드바 236px, sticky 헤더, 워드마크만(노란 타일 없음), 토글 위치, `Badge` 규격
- `/docs/USER_FLOW.md` — "화면" 표(라우트 목록과 접근 규칙)·"전역 셸" 문단·권한 매트릭스·"체험 만료는 예고한다"
- `/docs/ADR.md` — ADR-005(쓰기만 막고 읽기는 전부 허용)
- `/AGENTS.md` — entitlement 판정은 서버 유틸 한 곳에서만. `subscription_status` 문자열 직접 비교 금지

이전 phase(`0-foundation`)에서 만들어진 아래 파일을 **전부 읽고 시그니처를 확인한 뒤** 작업하라:

- `src/app/(app)/layout.tsx` — 지금은 로그인 확인만 하는 22줄이다. 이 step 이 셸로 교체한다
- `src/app/(app)/dashboard/page.tsx` — placeholder 다. 이 step 에서는 셸 안에 들어가기만 하면 되고, 내용은 step 2 가 만든다
- `src/app/layout.tsx` — Pretendard(`next/font/local`)와 `data-theme` 인라인 초기화 스크립트가 이미 있다. **테마 초기화를 다시 만들지 마라**
- `src/app/globals.css` — 토큰 전부(`--surface-*` · `--text-*` · `--hairline*` · `--cat-*` · `--space-*` · `--radius-*`)와 `.finsight-button*` 이 이미 있다
- `src/components/Button.tsx` — `variant: primary|secondary|ghost|yellow|danger`, `size: sm|md|lg`
- `src/lib/entitlement.ts` — `evaluateEntitlement(input) → { state, canRead, canWrite, trialEndsAt }`, `state` 는 `trialing|active|expired`
- `src/services/supabase.ts` — `createServerClient()` (async)
- `src/middleware.ts` — `/dashboard*` · `/settings` 로그인 가드가 이미 있다
- `supabase/migrations/*.sql` — 테이블·enum·기존 RPC 이름

## 작업

### 1. `src/lib/session.ts` — 요청당 1회 세션 컨텍스트

```ts
import "server-only";

export type SessionContext = {
  userId: string;
  email: string | null;
  entitlement: Entitlement;   // src/lib/entitlement.ts 의 타입
};

export const getSessionContext: () => Promise<SessionContext | null>;
```

- **React 의 `cache()` 로 감싼다.** 레이아웃·헤더·페이지가 각각 호출해도 한 요청 안에서 Supabase 조회는 1회여야 한다. 이유: 셸이 매 화면에서 권한을 읽는데 감싸지 않으면 한 페이지에 `auth.getUser()` + `profiles` 조회가 서너 번 붙는다
- `profiles` 에서 `subscription_status` · `trial_started_at` · `current_period_end` 를 읽어 `evaluateEntitlement` 에 넘긴다. **`subscription_status` 를 문자열로 직접 비교하지 마라** (AGENTS.md CRITICAL). 화면은 `entitlement.canWrite` · `entitlement.state` 만 본다
- 로그인하지 않았거나 프로필이 없으면 `null` 을 돌려준다
- `src/lib/` 이므로 **TDD Guard 대상이다. `src/lib/session.test.ts` 를 먼저 작성하라.** Supabase 클라이언트는 모킹한다

### 2. 마이그레이션 — `get_transaction_months`

새 파일 `supabase/migrations/<타임스탬프>_transaction_months.sql`:

```sql
create or replace function public.get_transaction_months(p_user_id uuid)
returns table (period date, transaction_count bigint)
```

- 그 사용자의 거래가 존재하는 **달 목록**을 최신순으로 돌려준다. 헤더의 월 선택 칩이 이걸 읽는다
- **`transaction_type` 필터를 넣지 마라** — 환불·입금만 있는 달도 선택 가능해야 한다. 대신 `category_fallback` 이나 `category is not null` 같은 신호용 필터도 넣지 마라. 이유: 이 함수는 "데이터가 있는 달"을 세는 것이지 지출 집계가 아니다
- 적용 후 `supabase gen types typescript --local` 결과를 `src/types/database.ts` 에 다시 저장한다. **손으로 수정하지 마라**

### 3. 컴포넌트 — `src/components/`

`src/components/` 는 TDD Guard 면제 대상이라 테스트 선작성 의무가 없다. 다만 `Badge` 는 렌더 테스트를 하나 남겨라.

- **`Badge.tsx`** — `variant: neutral | yellow | teal | success`, 높이 22px, pill. 쓰이는 곳: 읽기 전용·자동 추론·저장 완료·체험 안내 (DESIGN "컴포넌트")
- **`AppSidebar.tsx`** — 236px 고정, `--canvas` 바탕, 오른쪽 `--hairline` 1px, `position: sticky`, 높이 100vh
  - 좌상단은 **워드마크 `finsight` 하나다**(500 18px, 자간 −0.4px, `--ink`). **노란 타일·아이콘·지어낸 마크를 넣지 마라** (DESIGN "앱 셸")
  - 항목: 대시보드(`/dashboard`) · 거래 목록(`/dashboard/transactions`) · AI 리뷰(`/dashboard/review`) · 월간 리포트(`/dashboard/report`) · 요금제(`/dashboard/billing`). 항목 앞의 것은 아이콘이 아니라 **16px 둥근 사각형 색 점**이다
  - **AI 리뷰·월간 리포트는 `[yearMonth]` 가 필요한 라우트다.** 사이드바 링크는 가장 최근 거래 월(`get_transaction_months` 의 첫 행)로 보내고, 거래가 하나도 없으면 링크를 비활성으로 둔다
  - 선택된 항목은 `--surface` 바탕 + 굵기 500, 나머지는 배경 없음 + `--text-secondary`
  - 하단에 테마 토글과 사용자(이메일)
- **`ThemeToggle.tsx`** — client component. `localStorage` 의 `"theme"` 키를 읽고 쓰며 `document.documentElement.dataset.theme` 을 바꾼다. 키 이름과 값(`"light"`/`"dark"`)은 `src/app/layout.tsx` 의 인라인 스크립트와 **반드시 같아야 한다**. 이유: 다르면 새로고침할 때마다 토글이 되돌아간다
- **`AppHeader.tsx`** — sticky top-0, `--canvas` 바탕, 아래 `--hairline`, z-index 5, 패딩 16px 28px
  - 좌: 화면 제목 / 부제. 우: 월 선택 칩 + 액션 버튼
  - **월 선택 칩은 대시보드·AI 리뷰·월간 리포트에서만 뜬다.** 표시 여부를 props 로 받아라
  - 액션 버튼은 권한에 따라 바뀐다 — 쓰기 가능이면 "명세서 올리기"(`variant="primary"`), `expired` 면 "결제하고 계속 쓰기"(`variant="yellow"`, `/dashboard/billing` 으로 이동)
  - **업로드 다이얼로그 자체는 step 1 이 만든다.** 이 step 에서는 버튼이 `onUploadClick` 같은 props 를 호출하기만 하면 된다
- **`ReadOnlyBanner.tsx`** — `expired` 일 때만. `--surface-yellow` 바탕, 아래 `--hairline`, 배지 + 문장 + 우측 "요금제 보기" 링크. 헤더 바로 아래
- **`TrialEndingBanner.tsx`** — **체험 만료 2일 전부터** 뜬다(`entitlement.trialEndsAt` 기준, `state === "trialing"` 일 때만). "예고 없이 막히면 사용자는 고장으로 받아들인다"(USER_FLOW)
  - 남은 날짜 계산은 `Asia/Seoul` 기준이다 (ARCHITECTURE "패턴")

### 4. `src/app/(app)/layout.tsx` 교체

- `getSessionContext()` 로 사용자·권한을 읽고, 없으면 `redirect("/")`
- 사이드바 + 헤더 + 배너 + 본문(`24px 28px 56px`, `max-width: 1240px`) 구조로 감싼다
- 화면 제목·부제·월 칩 표시 여부는 화면마다 다르다. **`useState` 로 전역 상태를 만들지 마라** — 각 페이지가 헤더에 필요한 값을 넘길 수 있는 가장 단순한 방법(레이아웃에서 `usePathname` 기반 매핑 또는 페이지가 렌더하는 헤더)을 골라라. 전역 상태 라이브러리를 도입하지 않는다 (ARCHITECTURE "상태 관리")

### 5. `src/app/globals.css` 에 셸 클래스 추가

- 셸·사이드바·헤더·배너·배지에 필요한 클래스를 **토큰만 참조해** 추가한다. **컴포넌트에 hex·px 를 직접 쓰지 마라** (DESIGN 서두)
- 브레이크포인트 4단은 DESIGN "브레이크포인트" 표대로. `< 768px` 에서 사이드바가 사라지고 `768–1023px` 에서 아이콘 레일로 접힌다. **레일에는 아이콘이 없으므로 색 점만 남긴다**
- `[data-theme="dark"] select option { background:#1E1E28; color:#F1F1F5 }` 는 DESIGN 이 명시적으로 hex 를 지정한 예외다. 그대로 넣어라

## Acceptance Criteria

```bash
supabase db reset   # 마이그레이션 적용 성공 (로컬)
npm run build       # 컴파일 에러 없음
npm run lint        # 경고 0
npm test            # 기존 테스트 + session.ts · Badge 테스트 전부 통과
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `getSessionContext` 가 `cache()` 로 감싸져 한 요청에 Supabase 조회가 1회인가?
   - 화면 어디에서도 `subscription_status` 문자열을 직접 비교하지 않는가?
   - 컴포넌트에 hex·px 하드코딩이 없는가(DESIGN 이 지정한 `select option` 예외 제외)?
   - 사이드바에 노란 타일·지어낸 마크가 없는가?
   - `src/types/database.ts` 를 손으로 고치지 않고 생성 명령으로 갱신했는가?
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? ADR 기술 스택을 벗어나지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/1-dashboard/index.json` 의 step 0 을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step 이 알아야 할 것: `getSessionContext` 반환 타입, 셸 컴포넌트 파일명과 props, 헤더 액션 버튼을 어떻게 페이지가 제어하는지, 새 RPC 이름)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **업로드 다이얼로그·진행률 카드·대시보드 내용·거래 표를 만들지 마라.** 이유: 각각 step 1~3 의 몫이다. 이 step 은 그 화면들이 들어갈 셸까지다.
- **`data-theme` 을 클라이언트 마운트 후에 세팅하지 마라.** 이유: SSR 첫 페인트가 라이트로 깜빡인다. 인라인 스크립트가 이미 `src/app/layout.tsx` 에 있다 (DESIGN "다크 모드").
- **전역 상태 라이브러리를 도입하지 마라.** 이유: 클라이언트 상태는 `useState` 만 쓴다 (ARCHITECTURE "상태 관리").
- **`expired` 사용자에게 화면을 닫지 마라.** 이유: 만료는 쓰기만 막고 읽기는 전부 허용한다. 사이드바 항목을 숨기거나 라우트를 막으면 ADR-005 를 어긴다. 잠기는 것은 헤더의 업로드 버튼뿐이다.
- **카테고리에 이모지·아이콘을 붙이지 마라.** 이유: 이 시스템은 아이콘을 쓰지 않는다 (DESIGN "컴포넌트").
- **`src/types/database.ts` 를 손으로 작성하지 마라.** 생성 명령의 출력을 그대로 쓴다.
- 기존 테스트를 깨뜨리지 마라.
- 커밋하지 마라. execute.py 가 처리한다.
