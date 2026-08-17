# Step 0: ai-review

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ADR.md` — **ADR-012 전문이 이 step 의 단일 출처다.** "리뷰 화면은 그 달 신호를 전부 보여주고 … 두 화면 모두 LLM 호출이 0회다"
- `/docs/ARCHITECTURE.md` — "AI 리뷰" 절 전체와 신호 다섯 표면 표. 특히 "`period` 는 그 신호를 뒷받침하는 관측 구간의 마지막 달이다"
- `/docs/USER_FLOW.md` — S28 · S29 · S31 · S33 · S35 · S38, 권한 매트릭스("AI 리뷰 화면·신호 상세·거래 목록도 `expired` 에서 열린다")
- `/docs/DESIGN.md` — "화면별 메모"의 AI 리뷰 행(요약 카드 + 신호 타입 칩 5종 + 신호 카드 목록(좌 문장 / 우 영향도) + 반복 결제 표) · "타이포그래피"(신호 영향도 24px/500/−0.6px, 신호 키는 `--font-mono`) · "앱 셸"(AI 리뷰 최대 폭 900px)
- `/AGENTS.md` — 리포트와 AI 리뷰의 모든 수치는 SQL 집계 결과다 · 무엇을 지적할지도 LLM 이 고르지 않는다

이전 phase(`1-dashboard`)에서 만들어진 아래 파일을 **전부 읽고 시그니처를 확인한 뒤** 작업하라:

- `src/lib/session.ts` — `getSessionContext()`
- `src/components/AppHeader.tsx` · `AppSidebar.tsx` · `Badge.tsx` — 월 칩이 뜨는 화면 중 하나가 AI 리뷰다
- `src/app/(app)/dashboard/page.tsx` — 인사이트 카드가 "전체 리뷰" 링크로 이 화면을 부른다. **카드와 같은 데이터를 읽으므로 조회 방식을 맞춰라**
- `src/app/api/signals/[id]/dismiss/route.ts` — 숨기기 라우트
- `src/lib/signals/types.ts` — `Signal` · `SIGNAL_TYPES` 5종
- `src/lib/signals/thresholds.ts` — `SIGNAL_THRESHOLDS` 와 **`SIGNAL_CONDITION_COPY`(5종 문구 완비)**
- `supabase/migrations/20260817072000_init.sql` — `spending_signals` 의 컬럼(`period` · `type` · `target_key` · `payload` · `impact` · `narrative` · `dismissed_at`)과 `(user_id, type, period, target_key)` UNIQUE

## 작업

### 1. `src/lib/signals/thresholds.ts` 에 타입 라벨 추가

```ts
export const SIGNAL_TYPE_LABELS: Record<SignalType, string> = {
  category_spike: "카테고리 급증",
  new_merchant_large: "새 가맹점 큰 결제",
  outlier_transaction: "이상 결제",
  recurring_payment: "반복 결제",
  recurring_price_up: "구독료 인상",
};
```

`SIGNAL_CONDITION_COPY` 바로 옆에 둔다. 화면 문구는 임계값 상수와 같은 파일에서 함께 움직인다 (ADR-012). **`src/lib/` 이므로 TDD Guard 대상이다 — `thresholds.test.ts` 에 5종이 모두 채워졌다는 단언을 먼저 추가하라.**

### 2. `/dashboard/review/[yearMonth]` 화면

Server Component 로 `spending_signals` 를 조회한다. **RLS 가 걸린 세션 클라이언트로 직접 읽으면 되고, 새 RPC 를 만들 필요가 없다.**

- `yearMonth` 는 `YYYY-MM` 이다. `period` 는 `YYYY-MM-01` 의 `date` 다. 형식이 아니면 404
- 조회 조건: `user_id` = 본인, `period` = 그 달. **정렬은 `impact` 내림차순, NULL 은 뒤로**
- 화면 최대 폭 900px

구성:

- **요약 카드** — 그 달의 신호 개수와 `impact` 합계. **합계는 `impact IS NOT NULL` 인 신호만 더한다.** 숫자는 저장된 값을 더한 것이지 새로 계산한 것이 아니다
- **신호 타입 칩 5종** — `SIGNAL_TYPE_LABELS` 를 쓴다. **있는 것만 채우고**, 없는 타입은 비활성으로 두되 목록에서 지우지 마라. 칩을 누르면 그 타입만 필터한다(URL 검색 파라미터)
- **신호 카드 목록** — 좌: `narrative` 문장 / 우: `impact` (24px/500/−0.6px, `tabular-nums`)
  - **그 달 신호를 전부 보여준다. 상위 3개로 자르지 마라.** 카드 3장은 대시보드의 몫이고, 이 화면이 존재하는 이유가 나머지를 보여주는 것이다 (ADR-012 · S35)
  - `narrative` 가 NULL 이면 문장 자리를 비우고 `payload` 의 집계값만 보여준다. 서술 실패는 job 을 막지 않으므로 실제로 발생한다
  - **금액은 `payload` 의 집계값을 그대로 렌더한다.** `narrative` 안의 숫자를 파싱해 표시하지 마라 (AGENTS.md CRITICAL)
  - 각 카드는 신호 상세(`/dashboard/review/[yearMonth]/[signalId]`)로 링크한다. **상세 화면은 다음 step 이 만든다. 여기서는 링크까지다**
  - **`dismissed_at` 이 있는 신호도 목록에 남기고 `Badge variant="neutral"` 로 "숨김" 을 표시한다.** 이유: 숨기기는 대시보드 카드에서 그 신호를 내리는 동작이고(S31), 이 화면은 그 달의 **전수 목록**이다. 여기서까지 지우면 사용자가 무엇을 숨겼는지 확인할 방법이 없다. 다만 **이 화면에서 숨기기를 되돌리는 기능은 만들지 마라** — 요구에 없다
  - `narrative` 와 가맹점명은 React 기본 이스케이프로 렌더한다. **`dangerouslySetInnerHTML` 을 쓰지 마라**
- **반복 결제 섹션** — `recurring_payment` 은 `impact` 가 NULL 이라 위 목록의 맨 아래 **별도 섹션**으로 분리한다. 섹션 제목 옆에 **"평소 그 자체라 인사이트 카드에 올리지 않습니다"** 를 적는다 (S35). 표에는 가맹점 · 금액 · 주기 · 지속 개월을 `payload` 값으로 보여준다
  - `payload` 키: `merchantNormalized` · `latestAmount` · `minAmount` · `maxAmount` · `occurrenceCount` · `intervalDays` · `firstTransactedOn` · `lastTransactedOn`
  - **타입 이름을 하드코딩해 거르지 말고 `impact === null` 로 갈라라.** 판정 기준은 영향도의 유무다
- **빈 상태**
  - 그 달에 신호가 하나도 없음 → "이 달에는 지적할 만한 변화가 없었습니다"
  - 첫 달이라 비교 대상이 없어 `outlier_transaction` 만 있음 → **"다음 달이면 지난달과 비교해 드릴 수 있습니다"** (S29). 없는 것을 있는 척하지 않는다
- **`expired` 에서도 열린다** (ADR-005 · USER_FLOW 권한 매트릭스). 화면을 막지 마라. 이 화면에는 쓰기 동작이 없다

### 3. 사이드바 링크 정리

step 0(`1-dashboard`)의 사이드바가 "AI 리뷰" 를 가장 최근 거래 월로 보내고 있다. 이 step 에서 그 링크가 실제로 열리는지 확인하고, 거래가 없으면 비활성인 동작을 유지하라. **링크 규칙을 새로 만들지 마라.**

## Acceptance Criteria

```bash
npm run build       # 컴파일 에러 없음
npm run lint        # 경고 0
npm test            # thresholds 라벨 테스트 포함 전부 통과 (OpenAI 호출 0회)
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - **LLM 호출이 0회인가?** (이 화면은 저장된 `narrative` 를 읽기만 한다)
   - 그 달 신호를 전부 보여주는가? 상위 3개로 자르지 않았는가?
   - 금액이 `payload` 집계값이고 `narrative` 를 파싱하지 않는가?
   - 반복 결제 분리가 `impact === null` 기준인가? 타입 문자열 하드코딩이 아닌가?
   - `expired` 에서 화면이 열리는가?
   - 잘못된 `yearMonth` 와 신호 없는 달이 각각 404·빈 상태로 갈리는가?
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? ADR 기술 스택을 벗어나지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/2-review/index.json` 의 step 0 을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step 이 알아야 할 것: 화면 경로와 `yearMonth` 파싱 규약, 신호 조회 방식, `SIGNAL_TYPE_LABELS` 위치, 상세 화면 링크 형태)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **LLM 을 호출하지 마라.** 이유: 리뷰 화면은 이미 저장된 `narrative` 를 재사용하고 추가 호출이 0회다 (ADR-012). 호출을 넣으면 화면을 열 때마다 비용이 발생하고, 같은 신호에 매번 다른 문장이 나와 재현할 수 없다.
- **신호를 여기서 다시 탐지하거나 계산하지 마라.** 이유: 신호는 업로드 시점에만 만들어진다 (S37). 이 화면은 읽기 전용이다.
- **상위 N개로 자르지 마라.** 이유: 카드가 상위 3개만 보여주는 대신 나머지를 볼 곳이 이 화면이다 (ADR-012).
- **`recurring_payment` 에 `impact` 를 만들어 붙이지 마라.** 이유: 영향도가 없는 것이 이 신호의 정의다. 정렬을 위해 0을 넣으면 카드 선정 쿼리(`impact IS NOT NULL`)의 의미가 무너진다.
- **`dangerouslySetInnerHTML` 을 쓰지 마라.** 이유: `narrative` 는 LLM 이, 가맹점명은 사용자가 만든 문자열이다.
- **`expired` 에서 이 화면을 막지 마라.** 이유: 읽기는 전부 허용한다 (ADR-005).
- **신호 상세 화면·반복 지출 목록 화면·월간 리포트를 만들지 마라.** 이유: 각각 다음 step 들의 몫이다.
- 기존 테스트를 깨뜨리지 마라.
- 커밋하지 마라. execute.py 가 처리한다.
