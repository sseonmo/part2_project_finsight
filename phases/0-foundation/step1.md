# Step 1: design-tokens

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/DESIGN.md` — **이 step 의 단일 출처다. 전문을 읽어라.** 특히 "색", "카테고리 색 10종", "타이포그래피", "간격 · 모서리 · 그림자", "다크 모드", "컴포넌트"
- `/docs/PRD.md` — "카테고리 10종" (enum 의 유일한 출처)
- `/docs/ARCHITECTURE.md` — "디자인 토큰" 절
- `/design/README.md` — 프로토타입이 정본이 아닌 이유와 결정이 갈린 지점 7건

이전 step(project-setup)에서 만들어진 파일을 먼저 읽어라:

- `src/app/layout.tsx`
- `src/app/globals.css` — 지금은 Tailwind 지시문과 리셋만 들어 있다. 이 step 이 토큰을 채운다
- `src/app/(marketing)/page.tsx`
- `vitest.config.ts` · `tsconfig.json` · `package.json`

## 작업

`docs/DESIGN.md` 의 값을 코드로 옮긴다. **감으로 값을 채우지 마라. 문서에 없는 값이 필요하면 blocked 로 세우고 멈춰라.**

### 1. `src/app/globals.css` — 토큰

DESIGN.md 의 색 표를 **빠짐없이** CSS 변수로 옮긴다. 라이트는 `:root`, 다크는 `[data-theme="dark"]` 에 정의한다. 이름은 하나이고 값만 모드별로 바뀐다.

옮길 표: 표면 5종 · 경계선 3종 · 텍스트 7종 · 액션 3종 · 증감 3종 · **카테고리 10종(모드별 두 벌)** · 간격 7종 · radius 3종.

- 카테고리 변수는 값이 겹쳐도 **따로 선언한다**. `--cat-transport` 는 `--brand-blue` 와 값이 같지만 별개 변수다 (DESIGN.md "값이 겹쳐도 변수는 따로 둔다")
- Tailwind v4 를 쓰고 있다면 `@theme inline` 으로 **위 변수를 참조만** 하게 매핑한다. `@theme` 안에 hex 를 다시 적지 마라 — 값이 두 곳에 생긴다
- `[data-theme="dark"] select option` 규칙을 DESIGN.md "다크 모드" 절 그대로 넣는다

### 2. `src/lib/categories.ts` — enum 과 색의 단일 출처

**테스트를 먼저 써라** (TDD Guard 가 `src/lib/**` 를 막는다). `src/lib/categories.test.ts` 가 먼저 존재해야 한다.

시그니처 수준 인터페이스:

```ts
export const CATEGORIES = [...] as const          // PRD "카테고리 10종" 순서 그대로
export type Category = (typeof CATEGORIES)[number]
export const CATEGORY_COLORS: Record<Category, { light: string; dark: string }>
export const CATEGORY_TOKENS: Record<Category, string>   // globals.css 의 CSS 변수명
export function toCategory(value: string): Category       // enum 밖이면 '기타'
```

내부 구현은 재량이지만 아래는 반드시 지킨다:

- **카테고리는 정확히 10종이고 PRD 목록이 유일한 출처다.** 11번째를 추가하거나 이름을 바꾸지 마라
- `toCategory` 는 enum 을 벗어난 입력에 대해 예외를 던지지 말고 **`기타` 를 반환**한다. 이 함수가 step 5 의 LLM 분류 출력 폴백 지점이 된다
- `CATEGORY_COLORS` 의 값은 DESIGN.md 표와 **한 글자도 다르지 않아야 한다**

### 3. `src/lib/categories.test.ts` — 검증

- 10종의 개수 · 순서 · 이름이 PRD 와 일치
- `CATEGORY_COLORS` 의 20개 hex 가 DESIGN.md 표와 일치
- **대비비 검증**: 라이트 색은 `#FFFFFF` 대비, 다크 색은 `#14141C` 대비로 **WCAG 상대 휘도 대비가 3.0 이상**임을 계산해 확인한다. 대비 계산 함수는 이 테스트 파일 안에 두어라 — `src/lib/` 에 별도 모듈로 빼면 그 모듈의 테스트를 또 요구받는다
- `toCategory('식비')` → `식비`, `toCategory('암호화폐')` → `기타`, `toCategory('')` → `기타`

### 4. Pretendard 폰트

`next/font/local` 로 self-host 한다 (DESIGN.md "타이포그래피"). Google Fonts 에 없으므로 `next/font/google` 을 쓸 수 없고, CDN 링크도 쓰지 않는다.

- variable woff2 를 내려받아 `src/app/fonts/` 에 둔다. 후보 URL:
  `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/woff2/PretendardVariable.woff2`
- `--font-core` 와 `--font-display` 는 같은 값이다. 별도 제목용 폰트를 두지 마라
- `--font-mono` 는 시스템 스택 그대로: `ui-monospace, 'SF Mono', Menlo, Consolas`
- 금액·날짜용 `font-variant-numeric: tabular-nums` 유틸리티 클래스를 하나 둔다
- **다운로드가 네트워크 문제로 실패하면 `blocked` 로 기록하고 멈춰라.** 폰트 파일을 임의의 다른 폰트로 대체하지 마라

### 5. 다크 모드 초기화 스크립트

`src/app/layout.tsx` 의 `<head>` 에 **인라인 스크립트**로 저장된 테마를 첫 페인트 전에 `<html data-theme>` 에 적용한다 (DESIGN.md "다크 모드"). 클라이언트 컴포넌트에서 `useEffect` + `matchMedia` 로 판정하지 마라 — SSR 에서 첫 페인트가 라이트로 깜빡인다.

우선순위: `localStorage` 에 저장된 값 → 없으면 `prefers-color-scheme`.

**토글 UI 는 만들지 마라.** 토글은 사이드바 하단에 놓이고, 사이드바는 다음 phase 의 앱 셸 step 이 만든다.

### 6. `src/components/Button.tsx`

DESIGN.md "컴포넌트" 표대로 variant 5종(`primary` `secondary` `ghost` `yellow` `danger`) · size 3종(`sm` 36px · `md` 40px · `lg` 44px). Ghost 만 radius 8px 이고 나머지는 pill. 포커스는 항상 보이는 2px `--brand-blue`.

`src/app/(marketing)/page.tsx` 의 플레이스홀더 버튼을 이 컴포넌트로 교체한다 (여전히 동작하지 않는 플레이스홀더로 둔다).

## Acceptance Criteria

```bash
npm run build   # 컴파일 에러 없음
npm run lint    # 경고 0
npm test        # categories 테스트 포함 전부 통과
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `globals.css` 밖의 어떤 파일에도 hex 가 없는가? (`categories.ts` 는 예외 — 차트 라이브러리에 넘길 값이라 문서가 단일 출처로 지정한 곳이다)
   - 카테고리가 정확히 10종인가?
   - DESIGN.md 표의 값과 코드의 값이 일치하는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-foundation/index.json` 의 step 1 을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step 이 알아야 할 것: 토큰 변수 접두어 규칙, `categories.ts` 가 내보내는 심볼)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **`Badge` · `ProgressBar` · `PricingCard` · `PillTabs` 를 만들지 마라.** 이유: DESIGN.md "컴포넌트" 절이 "쓰이지 않는 컴포넌트를 미리 만들지 않는다"고 못박았고, 이 phase 에서 실제로 쓰이는 것은 `Button` 뿐이다. 나머지는 각각 업로드 · 요금제 화면을 만드는 step 이 함께 만든다.
- **컴포넌트에 hex 나 px 를 직접 쓰지 마라.** 이유: DESIGN.md 가 단일 출처라는 전제가 깨지면 값이 흩어져 다크 모드가 화면마다 어긋난다.
- **프로토타입(`design/prototype/`)의 값을 문서보다 우선하지 마라.** 값이 부딪히면 `docs/DESIGN.md` 가 이긴다. 프로토타입은 Hanken Grotesk · 카테고리 색 한 벌 · 노란 로고 타일을 쓰는데 셋 다 채택되지 않았다.
- **`design/prototype/` 아래 파일을 수정하지 마라.** 이유: 받은 원본 그대로 두기로 했다 (`design/README.md` "고치지 않는다").
- **아이콘 라이브러리를 설치하지 마라.** 이유: DESIGN.md — "아이콘은 쓰지 않는다. 사이드바 항목 앞의 것은 아이콘이 아니라 색 점이다".
- **숫자 카운트업 · 등장 애니메이션 · 그림자 글로우를 넣지 마라.**
- 기존 테스트를 깨뜨리지 마라.
- 커밋하지 마라. execute.py 가 처리한다.
