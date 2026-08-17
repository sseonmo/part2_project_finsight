# Step 0: project-setup

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — "디렉토리 구조", "패턴"
- `/docs/ADR.md` — ADR-010(런타임 제약), ADR-011(배포를 첫 step에서 준비한다)
- `/docs/DESIGN.md` — "앱 셸" 절의 워드마크 규칙 (이 step에서는 문자열 하나만 쓴다)
- `/AGENTS.md` — 아키텍처 규칙 · 명령어 · Hook
- `/.gitignore` — 이미 작성되어 있다. Next.js 항목이 들어 있는지 확인하고 부족하면 추가하라

이 저장소에는 이미 `docs/`, `design/`, `scripts/`, `phases/`, `AGENTS.md`, `CLAUDE.md`, `.env`, `.gitignore` 가 있다. **아직 애플리케이션 코드는 한 줄도 없다.** 이 step이 첫 코드다.

## 작업

Next.js 15 App Router 프로젝트 골격을 저장소 **루트에** 세운다. 하위 디렉토리에 만들지 마라.

### 1. 프로젝트 초기화

`create-next-app` 은 비어 있지 않은 디렉토리에서 실패할 수 있다. 실패하면 `package.json` · `tsconfig.json` · `next.config.ts` · `postcss.config.mjs` · `eslint.config.mjs` 를 직접 작성해라. 어느 쪽이든 결과는 같아야 한다:

- Next.js 15 (App Router) · React 19
- TypeScript **strict mode** (`"strict": true`, `"noUncheckedIndexedAccess": true`)
- Tailwind CSS
- ESLint (`next/core-web-vitals` + TypeScript)
- import alias `@/*` → `src/*`

**기존 파일을 덮어쓰지 마라.** 특히 `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `docs/`, `design/`, `scripts/`, `phases/`, `.env` 는 손대지 않는다. `.gitignore` 는 이미 Next.js 항목(`node_modules/`, `.next/`, `out/`, `next-env.d.ts`)을 담고 있으니 중복 추가하지 마라.

### 2. Vitest 셋업

- `vitest` · `@vitejs/plugin-react` · `jsdom` · `@testing-library/react` · `@testing-library/jest-dom`
- `vitest.config.ts` — `environment: 'jsdom'`, alias `@` → `src`, React 플러그인
- **setup 파일이 필요하면 `test/setup.ts` 에 두어라. 루트에 `vitest.setup.ts` 를 만들지 마라.**
  이유: 이 저장소의 TDD Guard hook 은 테스트 파일이 없는 `.ts` 를 `apply_patch` 단계에서 차단한다. `vitest.setup.ts` 는 예외 목록(`*.config.*`, `*.d.ts`, `types/`, `components/`, `app/` 아래 Next 라우팅 파일)에 들어가지 않아 차단된다. `test/` 디렉토리 아래 파일은 테스트로 인정되어 통과한다.

### 3. 디렉토리 골격

`/docs/ARCHITECTURE.md` "디렉토리 구조"를 따른다. **빈 디렉토리는 만들지 마라** — git 이 추적하지 않고, 각 디렉토리는 실제 파일이 생기는 step 에서 만들어진다. 이 step 에서 실제로 파일이 들어가는 곳은 다음뿐이다:

```
src/app/layout.tsx
src/app/globals.css              # 리셋과 Tailwind 지시문만. 색·폰트 금지 (아래 금지사항)
src/app/(marketing)/page.tsx     # mock 랜딩
src/app/(marketing)/page.test.tsx
```

### 4. mock 랜딩

`src/app/(marketing)/page.tsx` 는 **내용이 비어 있어도 되는 배포 확인용 페이지**다 (ADR-011). 담을 것:

- 워드마크 텍스트 `finsight`
- 한 줄 소개 (PRD "목표" 에서 가져온다)
- "구글로 시작하기" 버튼 — **동작하지 않는 플레이스홀더**다. `disabled` 로 두거나 링크를 걸지 마라. 로그인은 step 3 이 붙인다

`src/app/(marketing)/page.test.tsx` 에 워드마크 `finsight` 가 렌더되는지 확인하는 테스트를 하나 둔다. 이 테스트가 있어야 `npm test` 가 "테스트 없음"으로 실패하지 않는다.

### 5. `.env.example`

`/.env` 에 있는 **키 이름만** 복사해 값이 빈 `.env.example` 을 만든다. **실제 값을 절대 복사하지 마라.** 각 키 위에 한 줄 주석으로 어디서 받는 값인지 적는다.

### 6. `package.json` scripts

`/AGENTS.md` "명령어" 절과 일치시킨다:

```json
{ "dev": "next dev", "build": "next build", "lint": "...", "test": "vitest run" }
```

`test:watch` 처럼 요청하지 않은 스크립트를 추가하지 마라.

## Acceptance Criteria

```bash
npm install
npm run build   # 컴파일 에러 없음
npm run lint    # 경고 0
npm test        # 테스트 통과 (최소 1개)
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택(Next 15 · TS strict · Tailwind)을 벗어나지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
   - `.env` 의 값이 저장소 어디에도 복사되지 않았는가?
3. 결과에 따라 `phases/0-foundation/index.json` 의 step 0 을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step 이 알아야 할 것: 테스트 러너·설정 파일 위치·랜딩 경로)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **디자인 토큰(색 · 폰트 · 간격 · radius)을 넣지 마라.** 이유: step 1 이 `docs/DESIGN.md` 를 단일 출처로 `globals.css` 를 통째로 작성한다. 여기서 미리 값을 넣으면 색이 두 곳에 생기고, DESIGN.md 가 단일 출처라는 전제가 첫 step 에서 깨진다. `globals.css` 에는 Tailwind 지시문과 리셋만 둔다.
- **Supabase · OpenAI · Inngest · Polar 클라이언트나 래퍼를 만들지 마라.** 이유: 각각 step 2 · 5 · 7 이 담당하고, 그 step 들이 테스트를 먼저 쓰는 순서로 설계되어 있다.
- **`npx vercel` 또는 `vercel` 명령을 실행하지 마라.** 이유: 대화형 로그인이 필요해 세션이 타임아웃까지 멈춘다. Vercel 연결은 이 step 이 끝난 뒤 사용자가 대시보드에서 1회 수행한다.
- **`.env` 를 커밋하거나 그 값을 코드 · 문서 · 테스트에 복사하지 마라.**
- **`src/lib/`, `src/services/`, `src/types/`, `src/inngest/`, `src/components/` 에 파일을 만들지 마라.** 이유: 이 step 의 범위는 골격과 배포 경로 확인이다. 쓰이지 않는 파일을 미리 만들지 않는다.
- 기존 테스트를 깨뜨리지 마라.
- 커밋하지 마라. execute.py 가 처리한다.
