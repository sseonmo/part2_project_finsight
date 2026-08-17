# Step 3: landing-final

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ADR.md` — **ADR-011 전문.** "마지막 step 에는 랜딩 완성과 env·endpoint·Protection 최종 검증만 남긴다" · "**그 Protection 이 나중에 Inngest 연동 step 에서 워커 호출을 막는 원인이 된다 — 이 충돌을 앞에서 만나는 것 자체가 목적이다**" · ADR-007(랜딩의 가격 섹션 CTA 는 구글 로그인으로 보낸다)
- `/docs/PRD.md` — "목표" · "사용자"("계좌를 연동하지 않는다는 점이 단점이 아니라 선택 이유다") · "수익 구조"(월 4,900원 / 연 49,000원) · "디자인"
- `/docs/DESIGN.md` — "앱 셸"(**좌상단은 워드마크 `finsight` 하나다. 지어낸 마크를 넣지 않는다. 파비콘과 OG 이미지도 워드마크에서 파생한다**) · "구현 때 정할 것"(Pretendard 로딩 방식 — subset 범위는 실제 번들 크기를 보고 정한다) · "타이포그래피"
- `/docs/USER_FLOW.md` — S1(첫 방문 → 가입) · S26(비로그인 딥링크는 **원래 가려던 경로로** 복귀) · "화면" 표의 `/` 행
- `/docs/ARCHITECTURE.md` — "패턴"(워커 라우트는 Node 런타임 고정, `/api/inngest` 에 `maxDuration` 명시, **Inngest 서버가 endpoint 에 닿도록 Vercel Deployment Protection 설정을 확인한다**) · "외부 진입점"

이전 step 에서 만들어진 아래 파일을 **전부 읽고 확인한 뒤** 작업하라:

- `src/app/(marketing)/page.tsx` — **지금은 mock 랜딩이다. 이 step 이 완성한다**
- `src/app/layout.tsx` — `next/font/local` 로 `./fonts/PretendardVariable.woff2` 를 싣고 `data-theme` 을 초기화한다. `metadata` 도 여기 있다
- `src/app/fonts/` — 현재 Pretendard 원본 파일
- `src/app/api/inngest/route.ts` — 런타임·`maxDuration` 설정
- `src/app/api/webhooks/polar/route.ts` — 등록해야 할 웹훅 URL 경로
- `src/middleware.ts` — `/` 에서 로그인 사용자를 `/dashboard` 로 보내고, 보호 경로는 `redirectTo` 파라미터로 복귀시킨다
- `src/app/auth/callback/route.ts` — `redirectTo` 처리
- `.env.example` — 이전 step 들이 추가한 변수
- `src/components/PricingCard.tsx` · `PillTabs.tsx` · `Button.tsx` · `Badge.tsx`

## 작업

### 1. 랜딩 완성 — `src/app/(marketing)/page.tsx`

**도구처럼 보여야 한다. 매일 여는 대시보드지 마케팅 페이지가 아니다** (PRD "디자인"). 80px hero 같은 마케팅 스케일을 쓰지 마라 — DESIGN 타이포 스케일의 최댓값은 32px 다.

- **히어로** — 제품이 무엇인지 한 줄. CTA 는 구글 로그인. "7일 무료 체험, 카드 등록 없이" 를 함께
- **왜 CSV 인가** — 계좌를 연동하지 않는 것이 선택 이유다 (PRD "사용자"). 단점을 변명하지 말고 근거를 적어라
- **3단계 흐름** — CSV 올리기 → 자동 분류 → 지적 받기
- **"이런 문장을 받게 됩니다" 예시 3개** — 신호 5종 중 대표적인 형태. **예시임을 명확히 밝혀라.** 실제 사용자 데이터처럼 보이게 만들지 마라
- **가격 섹션** — 월 4,900원 / 연 49,000원. `PricingCard` 를 재사용한다
  - **CTA 는 구글 로그인으로 보낸다. 여기서 체크아웃을 열지 마라** (ADR-007). 체크아웃은 로그인된 `/dashboard/billing` 에서만 생성된다
- 라이트/다크 두 벌 모두에서 확인하라. 토큰만 쓰고 hex 를 박지 마라
- 로그인 상태로 `/` 에 오면 미들웨어가 이미 `/dashboard` 로 보낸다. **랜딩에서 같은 리다이렉트를 다시 만들지 마라**

### 2. 파비콘 · OG 이미지

- **워드마크 `finsight` 에서 파생한다. 별도의 마크·아이콘·로고를 지어내지 마라** (DESIGN "앱 셸")
- 파비콘은 `src/app/icon.svg`, OG 는 `src/app/opengraph-image.*` (Next.js App Router 파일 규약)
- **새 이미지 라이브러리를 설치하지 마라.** Next 내장(`next/og`)이나 정적 SVG 로 충분하다
- `src/app/layout.tsx` 의 `metadata` 에 OG 제목·설명을 채운다

### 3. Pretendard subset

현재 `PretendardVariable.woff2` 는 약 2.0MB 다. 첫 방문에 전부 내려간다.

- **로컬에서 subset 해 결과 파일을 저장소에 커밋한다.** 한글 상용 영역 + 라틴 + 숫자 + 문장부호면 충분하다
- **빌드 의존성(fonttools 등)을 `package.json` 에 추가하지 마라.** subset 은 개발자 머신에서 한 번 하는 작업이고, 결과물만 저장소에 들어간다
- **subset 도구가 로컬에 없으면 원본을 그대로 두고 그 사실을 summary 에 적어라.** 이것을 `blocked` 로 만들지 마라 — 앱 동작에 영향이 없다
- subset 했다면 `src/app/layout.tsx` 의 `localFont` 경로를 맞추고, **`weight: "45 920"` 범위가 유지되는지 확인하라.** variable 축을 잃으면 500·600 굵기가 렌더되지 않는다
- 전후 파일 크기를 summary 에 적어라

### 4. 환경변수 정리

`.env.example` 을 최종 정리한다. 이 프로젝트가 요구하는 변수를 **한 곳에 모으고 각각 어디서 쓰는지 한 줄씩 주석**을 단다:

- Supabase: URL · anon key · **service role key**
- OpenAI: API key
- Inngest: signing key · event key
- Polar: access token · webhook secret · product id 2종 · server(sandbox/production)
- 사이트: 공개 base URL

**실제 키 값을 커밋하지 마라.** `.env.local` 이 `.gitignore` 에 있는지 확인하라.

### 5. 배포 검증 (ADR-011)

**여기까지의 코드 작업을 전부 끝낸 뒤에 착수하라.** 아래는 외부 설정이 필요할 수 있다.

1. `npm run build` 가 로컬에서 통과하는지 먼저 확인한다
2. Vercel 프로젝트가 연결돼 있는지 확인한다. 연결돼 있다면 preview 배포를 만들고, 아니면 **연결이 필요하다는 것을 `blocked_reason` 에 적는다**
3. Vercel 환경변수에 위 목록이 전부 설정돼 있는지 확인한다
4. **`/api/inngest` 가 Deployment Protection 에 막히지 않는지 확인한다.** 이것이 ADR-011 이 예고한 충돌이다 — Protection 이 켜져 있으면 Inngest 서버가 endpoint 에 닿지 못해 워커가 통째로 동작하지 않는다. 막힌다면 그 경로만 여는 설정(Protection Bypass)이 필요하다
5. **Polar 웹훅 URL 을 등록해야 한다** — `{배포 URL}/api/webhooks/polar`. 등록은 Polar 대시보드에서 하는 외부 작업이다
6. `/api/webhooks/polar` 도 Protection 에 막히면 결제가 반영되지 않는다. 같이 확인하라

**2·3·5 는 사용자 개입이 필요한 외부 설정이다.** 코드 산출물(1·4의 코드 측면)을 전부 끝낸 뒤 여기서 막히면 **`blocked` 로 두고 무엇을 해야 하는지 구체적으로 적어라.** 추측으로 진행하지 마라.

## Acceptance Criteria

```bash
npm run build       # 컴파일 에러 없음
npm run lint        # 경고 0
npm test            # 전체 테스트 통과
```

배포 검증은 위 5번 절차로 확인한다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 랜딩의 가격 CTA 가 **로그인으로** 가는가? 체크아웃을 열지 않는가?
   - 파비콘·OG 가 워드마크에서 파생했는가? 지어낸 마크가 없는가?
   - 마케팅 타이포 스케일(80px hero 등)을 쓰지 않았는가?
   - 폰트 subset 을 했다면 variable 축(`45 920`)이 유지되는가? 빌드 의존성을 추가하지 않았는가?
   - `.env.example` 에 실제 키가 들어가지 않았는가?
   - `/api/inngest` 가 Node 런타임이고 `maxDuration` 이 명시돼 있는가?
   - 라이트·다크 양쪽에서 랜딩이 읽히는가?
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? ADR 기술 스택을 벗어나지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/3-billing/index.json` 의 step 3 을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (폰트 subset 여부와 전후 크기, 배포 검증 결과, Protection·웹훅 등록 상태를 반드시 포함)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (Vercel 연결·환경변수 설정·Polar 웹훅 등록·Deployment Protection 변경) → `"status": "blocked"`, `"blocked_reason"` 에 **무엇을 어디서 해야 하는지 구체적으로** 적고 즉시 중단

## 금지사항

- **랜딩에서 Polar 체크아웃을 열지 마라.** 이유: 비로그인 결제를 받으면 `user_id` 를 metadata 에 실을 수 없어 웹훅이 어느 계정을 켤지 알 수 없다 (ADR-007).
- **지어낸 로고 마크를 만들지 마라.** 이유: 워드마크 하나가 결정이고 파비콘·OG 도 거기서 파생한다 (DESIGN "앱 셸").
- **마케팅용 타이포 스케일(hero 80px, stat 64px)을 쓰지 마라.** 이유: 그 스케일은 다른 제품용 디자인 시스템의 것이고 이 제품은 도구처럼 보여야 한다 (DESIGN "출처와 효력").
- **빌드 의존성을 추가해 폰트를 subset 하지 마라.** 이유: subset 은 한 번 하는 작업이고 결과물만 커밋한다.
- **폰트 subset 실패를 `blocked` 로 만들지 마라.** 이유: 앱 동작에 영향이 없다. 원본을 유지하고 summary 에 적으면 된다.
- **실제 키를 저장소에 커밋하지 마라.** 이유: service role key 와 Polar access token 은 유출되면 전 사용자 데이터와 결제에 접근할 수 있다.
- **Deployment Protection 을 전면 해제하지 마라.** 이유: 미완성 앱의 URL 이 열린 채로 남는다. 필요한 것은 특정 endpoint 에 대한 우회다 (ADR-011).
- **새 기능을 추가하지 마라.** 이유: 이 step 은 랜딩 완성과 배포 검증이다. MVP 제외 사항(PRD)에 있는 것을 여기서 끼워 넣지 마라.
- 기존 테스트를 깨뜨리지 마라.
- 커밋하지 마라. execute.py 가 처리한다.
