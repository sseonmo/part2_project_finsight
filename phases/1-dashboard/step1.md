# Step 1: upload-dialog

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/USER_FLOW.md` — **"다이얼로그는 파일 선택과 카드 지정까지만 담고, 그 뒤는 대시보드 상단의 진행률 카드로 넘긴다" 문단과 "완료 요약 규칙" 이 이 step 의 단일 출처다.** S2 · S6 · S9 · S12 · S12b · S12c · S13 · S14 · S15 · S16 · S18 · S24b · S25 · "검증된 마찰점과 대응"
- `/docs/ARCHITECTURE.md` — "업로드 파이프라인" 1~4단계, "상태 관리"(폴링은 `completed`·`failed`·`needs_mapping` 에서 멈춘다)
- `/docs/ADR.md` — ADR-001(정상 경로에 확인 화면을 두지 않는다) · ADR-003(`card_label` 이 `dedupe_key` 구성 요소) · ADR-005(쓰기 게이트)
- `/docs/DESIGN.md` — "ProgressBar"(높이 8px, 바탕 `--surface`, 채움 `--ink`, width 트랜지션 300ms) · "컴포넌트"
- `/AGENTS.md` — 원본 파일은 Next.js 서버를 통과하지 않는다 · Storage 키 파일명은 서버가 생성 · entitlement 는 서버 유틸 한 곳

이전 step 에서 만들어진 아래 파일을 **전부 읽고 시그니처를 확인한 뒤** 작업하라:

- `src/lib/session.ts` — `getSessionContext()` (step 0 산출물)
- `src/components/AppHeader.tsx` · `AppSidebar.tsx` · `Badge.tsx` — 헤더의 "명세서 올리기" 버튼이 이 step 의 다이얼로그를 연다
- `src/app/(app)/layout.tsx` · `src/app/(app)/dashboard/page.tsx`
- `src/app/api/uploads/signed-url/route.ts` — 201 `{ jobId, storageKey, uploadUrl, token, path, maxSizeBytes, contentType }`. 요청 본문은 `{ filename, contentType, size, cardLabel }`. **entitlement 게이트가 이미 있다**
- `src/app/api/uploads/[id]/route.ts` — GET 200 `{ id, status, failedReason, summary: { insertedCount, duplicateCount, skippedRows, uncategorizedCount }, cardLabelMismatchWarning }`
- `src/app/api/uploads/[id]/start/route.ts` — 202 `{ id, status: "parsing" }`. **entitlement 게이트가 없다. 이 step 이 추가한다**
- `src/app/api/uploads/[id]/mapping/route.ts` — 402/422 응답과 `mappingAttemptCount`
- `src/services/supabase.ts` — `createBrowserClient()` (Storage 직접 업로드에 쓴다)
- `src/lib/entitlement.ts`

## 작업

### 1. `POST /api/uploads/[id]/start` 에 entitlement 쓰기 게이트를 추가한다

현재 이 라우트는 소유자만 확인하고 권한을 보지 않는다. **체험 중에 `signed-url` 로 job 을 여러 개 쌓아두고 만료 후 `start` 만 호출하면 ADR-005 의 쓰기 차단이 통째로 우회된다.**

- `signed-url` 라우트와 같은 방식으로 `profiles` 를 읽어 `evaluateEntitlement` 를 호출하고, `canWrite` 가 false 면 403 으로 거부한다
- **`subscription_status` 를 직접 비교하지 마라.** `evaluateEntitlement` 만 쓴다
- **`route.ts` 는 TDD Guard 검사 대상이다.** `src/app/api/uploads/[id]/start/route.test.ts` 에 "만료 사용자의 start 요청이 403" 케이스를 **먼저** 추가하라

### 2. `src/components/ProgressBar.tsx`

```tsx
export function ProgressBar(props: { value: number; label: string }): JSX.Element
```

- 높이 8px, 바탕 `--surface`, 채움 `--ink`, `--radius-full`, `overflow: hidden`
- width 트랜지션 300ms — **이 시스템에서 유일하게 허용되는 길이 애니메이션이다**
- **진행률만 돌리지 말고 지금 무엇을 하는 중인지 문장을 함께 둔다** (DESIGN "ProgressBar")

### 3. `src/components/UploadDialog.tsx` — client component

다이얼로그가 담는 것은 **파일 선택과 카드 지정까지다.** 진행률·완료 요약·거절 사유는 다이얼로그가 아니라 대시보드에 남는다.

- **파일 선택** — CSV 만. `.xlsx`·PDF·빈 파일은 **업로드 전 클라이언트에서 거부**한다(S16): "CSV 파일만 올릴 수 있습니다. 카드사에서 '엑셀 저장' 대신 'CSV 저장'을 선택하세요"
- **카드 지정**(`card_label`) — **첫 업로드에는 "카드 1" 이 이미 채워져 있고** 그 자리에서 이름을 고칠 수 있다. 두 번째부터는 기존 카드 목록 드롭다운 + "새 카드 추가"
  - 카드 목록은 `SELECT DISTINCT card_label FROM upload_jobs WHERE user_id = ?` 다. **카드 테이블을 만들지 마라** (ARCHITECTURE "데이터 모델"). 목록은 서버 컴포넌트가 조회해 props 로 내려준다
  - 비어 있으면 제출할 수 없다 — `dedupe_key` 구성 요소라 비울 수 없다 (ADR-003)
- **CSV 받는 법 안내** — 주요 카드사·은행별 내역 다운로드 경로를 한 줄씩. **이 안내가 이 화면에서 가장 중요한 부분이다.** U2(신규 가입자)가 이탈하는 지점이 정확히 여기다 (USER_FLOW "검증된 마찰점")
- **업로드 절차**: `POST /api/uploads/signed-url` → 응답의 `token`/`path` 로 **Supabase Storage 에 클라이언트가 직접 업로드**(`createBrowserClient()` 의 `storage.from(...).uploadToSignedUrl(...)`) → `POST /api/uploads/[id]/start` → 다이얼로그를 닫고 진행률 카드로 넘긴다
- **파일 본문을 Next.js 라우트로 보내지 마라** (AGENTS.md CRITICAL). 서버는 서명 URL 만 만든다
- `expired` 면 다이얼로그가 열리지 않는다 — 헤더 버튼이 이미 "결제하고 계속 쓰기"로 바뀌어 있다(step 0). 그래도 서버는 403 을 돌려준다는 것을 전제로 에러를 사람 말로 표시하라 (S18)

### 4. `src/components/UploadProgressCard.tsx` — 대시보드 상단 진행률 카드

- `GET /api/uploads/[id]` 를 **2초 간격으로 폴링**한다
- **`completed` · `failed` · `needs_mapping` 에서 폴링을 멈춘다** (ARCHITECTURE "상태 관리"). 멈추지 않으면 완료된 job 에 무한 요청이 간다
- 상태별 문구 (USER_FLOW "상태 머신 1" 표 그대로):
  - `pending` → "업로드 중"
  - `parsing` → "거래 내역을 읽는 중"
  - `categorizing` → "카테고리를 분류하는 중"
  - `needs_mapping` → "어떤 컬럼이 날짜·금액·가맹점인지 알려주세요" + `/dashboard/uploads/[id]/mapping` 으로 가는 링크 (**화면 자체는 step 5 가 만든다. 여기서는 링크까지다**)
  - `failed` → `failedReason` 을 그대로 + "다시 시도" (S14 — 기술 로그가 아니라 사람 말이다)
  - `completed` → 완료 요약
- **업로드 여러 건이 동시에 진행되면 카드를 여러 개 쌓는다** (S25)
- **`/dashboard` 진입 시 진행 중 job 을 조회해 카드부터 보여준다** (S6). 브라우저를 닫아도 워커는 돈다. 진행 중 job 목록은 서버 컴포넌트가 조회해 props 로 내려준다

### 5. `src/components/UploadSummary.tsx` — 완료 요약

**네 숫자를 규칙대로 렌더한다** (USER_FLOW "완료 요약 규칙"):

- 새로 추가된 거래 N건 / 중복이라 건너뛴 거래 N건 / 읽지 못한 행 N건 / 분류하지 못해 "기타"로 넣은 가맹점 N개
- **숫자가 0인 항목은 표시하지 않는다. 단 "새로 추가된 거래 0건" 은 0이어도 반드시 표시한다** — 사용자가 가장 혼란스러워하는 경우다 (S15)
- `cardLabelMismatchWarning` 이 있으면 함께 띄운다. **숫자가 아니라 문장이고 조건이 걸릴 때만 나온다** (S24b)
- 인사이트 카드 3장은 이 요약 아래에 붙는다(S28). **카드는 step 2 가 만든다.** 이 step 에서는 자리만 비워두고 아무것도 렌더하지 마라

### 6. 대시보드 페이지에 배선

`src/app/(app)/dashboard/page.tsx` 는 아직 placeholder 다. 이 step 에서는 **진행률 카드 영역과 업로드 다이얼로그 트리거만** 붙인다. KPI·차트·인사이트 카드는 step 2 가 채운다.

## Acceptance Criteria

```bash
npm run build       # 컴파일 에러 없음
npm run lint        # 경고 0
npm test            # start 라우트 403 테스트 포함 전부 통과 (실제 네트워크 호출 0회)
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `start` 라우트가 만료 사용자를 403 으로 거부하는가? 그 테스트를 구현보다 먼저 썼는가?
   - 파일 본문이 Next.js 라우트를 통과하지 않는가?
   - 폴링이 `completed`·`failed`·`needs_mapping` 에서 멈추는가?
   - 완료 요약이 "새로 추가된 거래 0건" 을 0이어도 표시하는가?
   - 카드 목록을 위한 테이블·마이그레이션을 만들지 않았는가?
   - 컴포넌트에 hex·px 하드코딩이 없는가?
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? ADR 기술 스택을 벗어나지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/1-dashboard/index.json` 의 step 1 을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step 이 알아야 할 것: 컴포넌트 파일명과 props, 진행 중 job 을 어디서 조회해 내려주는지, 완료 요약 아래 인사이트 카드가 붙을 자리)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **정상 경로에 컬럼 매핑 확인 단계를 만들지 마라.** 이유: 자동 추론이 성공하면 묻지 않는다. 확인 화면은 `needs_mapping` 일 때만 뜨는 별도 라우트다 (ADR-001). 정상 경로에 확인 화면을 두면 첫 업로드 이탈이 생기고, 그 이탈이 이 제품에서 가장 큰 마찰이다.
- **파일 본문을 받는 라우트 핸들러를 만들지 마라.** 이유: 클라이언트가 서명 URL 로 Storage 에 직접 올린다 (AGENTS.md CRITICAL).
- **Storage 키를 클라이언트에서 만들지 마라.** 이유: 다른 사용자 경로에 쓸 수 있고 서명이 그 조작을 승인해 버린다. 키는 `signed-url` 라우트가 이미 만들어 돌려준다.
- **진행률·완료 요약을 다이얼로그 안에 두지 마라.** 이유: S6(처리 중 이탈 후 재방문)이 어차피 대시보드의 카드를 요구하므로 두 벌을 만들게 된다.
- **폴링 간격을 2초보다 짧게 하지 마라.** 이유: 처리에 수십 초가 걸리는 job 을 여러 건 띄우면 요청이 곱해진다.
- **`card_label` 을 선택 항목으로 만들지 마라.** 이유: `dedupe_key` 구성 요소라 비면 중복 판정이 무너진다 (ADR-003). 마찰은 기본값 "카드 1" 로 흡수한다.
- **대시보드 집계·차트·인사이트 카드를 만들지 마라.** 이유: step 2 의 몫이다.
- 기존 테스트를 깨뜨리지 마라.
- 커밋하지 마라. execute.py 가 처리한다.
