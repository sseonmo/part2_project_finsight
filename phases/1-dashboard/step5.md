# Step 5: manual-mapping

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/USER_FLOW.md` — **S9(자동 컬럼 매핑 실패) · S10(수동 매핑도 검증 실패) · S11(매핑 포기) 이 이 step 의 단일 출처다.** "프로토타입이 생략한 것" 의 수동 컬럼 매핑 화면 행
- `/docs/ADR.md` — **ADR-001** 전문. 특히 "수동 매핑 화면은 성공률 90% 미만일 때만 뜨므로 정상 경로를 건드리지 않으면서 그 막다른 길을 없앤다"
- `/docs/ARCHITECTURE.md` — "업로드 파이프라인" 6~8단계 · "두 종류의 실패" 표 · "외부 진입점"(`/api/uploads/:id` 계열은 매 요청 job 소유자를 확인한다)
- `/docs/DESIGN.md` — "타이포그래피"(CSV 미리보기 날짜는 `--font-mono`) · "앱 셸"(업로드 화면 최대 폭 1000px)
- `/AGENTS.md` — 원본 파일 읽기는 Inngest 워커/service role 만 · job 소유자 확인

이전 step 에서 만들어진 아래 파일을 **전부 읽고 시그니처를 확인한 뒤** 작업하라:

- `src/app/api/uploads/[id]/mapping/route.ts` — `needs_mapping` 일 때만 받고, `mapping_attempt_count` 상한 3회, 202 `{ id, status: "parsing", mappingAttemptCount }` / 422 "이 파일은 읽을 수 없습니다"
- `src/app/api/uploads/[id]/route.ts` — GET·DELETE
- `src/lib/csv/encoding.ts` · `src/lib/csv/parse.ts` — `decodeCsv` · `parseCsv(text) → { header, rows }`
- `src/lib/csv/mapping.ts` — `ColumnMapping = { date, amount, merchant, type? }`
- `src/services/supabase-service-role.ts` — `createServiceRoleClient()` (`server-only`)
- `src/app/(app)/dashboard/uploads/` — 이력 화면(step 4)이 `needs_mapping` job 에서 이 화면으로 링크한다
- `src/components/Badge.tsx` · `Button.tsx`

## 작업

### 1. `GET /api/uploads/[id]/preview` — CSV 앞 10행 미리보기

```
응답 200: { header: string[], rows: string[][], mappingAttemptCount: number, remainingAttempts: number }
```

- **세션 클라이언트로 job 을 조회해 소유자를 확인한다.** 남의 job id 면 404 다. 이 확인이 유일한 방어선이다 (ARCHITECTURE "외부 진입점")
- 소유자 확인을 통과한 뒤에만 **service role 클라이언트로 Storage 원본을 읽는다.** 버킷은 private 이고 읽기는 service role 만 한다 (ADR-009)
- `decodeCsv` → `parseCsv` 로 헤더와 **앞 10행**만 잘라 돌려준다. **전체 행을 응답에 담지 마라** — 화면이 필요로 하는 것은 10행이고, 수백 행을 내리면 개인 금융 데이터가 불필요하게 브라우저로 나간다
- job 이 `needs_mapping` 이 아니면 409 다
- **`route.ts` 는 TDD Guard 검사 대상이다.** `route.test.ts` 를 **먼저** 작성하라 — 남의 job id 로 접근하면 거부, `needs_mapping` 이 아니면 409, 응답 행이 10개를 넘지 않음

### 2. 이 두 라우트에 entitlement 쓰기 게이트를 걸지 않는다 — 그리고 그 이유를 코드에 남긴다

`/api/uploads/[id]/mapping` 과 `/api/uploads/[id]/preview` 는 **의도적으로 entitlement 게이트가 없다.** 두 라우트 각각에 아래 취지의 주석을 남겨라:

> 이 경로에는 entitlement 쓰기 게이트를 걸지 않는다. 이미 `signed-url` 과 `start` 의 게이트를 통과해 개시된 파이프라인의 **완료 경로**이고, `csv.mapping_confirmed` 는 오히려 컬럼 추론 LLM 호출을 건너뛴다. 시도 상한 3회가 남용을 막는다. 여기를 막으면 체험이 만료되는 순간 `needs_mapping` 상태의 업로드가 영영 미완으로 남아, ADR-001 이 없애려던 막다른 길이 되살아난다.

**"일관성"을 이유로 게이트를 추가하지 마라.** 업로드 개시(`signed-url` · `start`)와 완료(`mapping` · `preview`)는 다르게 취급하는 것이 이 설계의 결정이다.

### 3. `/dashboard/uploads/[id]/mapping` — 컬럼 선택 화면

- 최대 폭 1000px
- **미리보기 표** — `GET /api/uploads/[id]/preview` 의 헤더 + 10행. 날짜처럼 보이는 값과 행 번호는 `--font-mono` (DESIGN "타이포그래피")
- **드롭다운** — 날짜 · 금액 · 가맹점 **3개는 필수**, 유형(`type`)은 선택이다. 선택지는 미리보기의 헤더 값 그대로다
  - 고른 컬럼이 미리보기 표에서 강조되면 사용자가 즉시 확인할 수 있다
- **확정** → `POST /api/uploads/[id]/mapping` 에 `{ mapping: { date, amount, merchant, type? } }`. 성공(202)이면 업로드 이력 또는 대시보드로 보내고 진행률 카드가 이어받는다
- **실패 응답 처리** (S10):
  - 400 → "날짜, 금액, 가맹점 컬럼을 모두 골라주세요"
  - 워커가 다시 `needs_mapping` 으로 되돌린 경우 → "선택한 컬럼으로 날짜를 읽지 못했습니다. 다른 컬럼을 골라주세요"
  - 422 → **"이 파일은 읽을 수 없습니다"** + **업로드 취소**(`DELETE /api/uploads/[id]`). 상한에 닿으면 다른 선택지를 주지 마라
- **남은 시도 횟수를 화면에 노출한다.** 상한이 있다는 사실을 마지막 시도에서 처음 알게 하지 마라
- 이 화면은 **job 이 `needs_mapping` 일 때만 열린다.** 다른 상태면 이력 화면으로 돌려보낸다 (USER_FLOW "화면" 표)

## Acceptance Criteria

```bash
npm run build       # 컴파일 에러 없음
npm run lint        # 경고 0
npm test            # preview 라우트 테스트 포함 전부 통과 (실제 Storage 접근 0회)
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - preview 라우트가 **소유자 확인을 먼저 하고** 그 뒤에만 service role 로 Storage 를 읽는가?
   - 응답에 10행만 담기는가? 전체 행이 나가지 않는가?
   - `mapping`·`preview` 에 entitlement 게이트를 넣지 **않았고** 그 근거가 주석으로 남아 있는가?
   - 남은 시도 횟수가 화면에 보이는가? 422 에서 업로드 취소 경로를 주는가?
   - 정상 경로(자동 추론 성공)에는 이 화면이 끼어들지 않는가?
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? ADR 기술 스택을 벗어나지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/1-dashboard/index.json` 의 step 5 를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 phase 가 알아야 할 것: preview 라우트 경로와 응답 형태, 매핑 화면 경로)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **`mapping`·`preview` 라우트에 entitlement 쓰기 게이트를 추가하지 마라.** 이유: 위 2번에 적힌 그대로다. 체험 만료 순간 `needs_mapping` 업로드가 영영 미완이 되어 ADR-001 이 없앤 막다른 길이 되살아난다.
- **정상 경로에 컬럼 확인 단계를 넣지 마라.** 이유: 자동 추론이 성공하면 묻지 않는다. 이 화면은 `needs_mapping` 일 때만 뜬다 (ADR-001).
- **소유자 확인 없이 service role 로 Storage 를 읽지 마라.** 이유: service role 은 RLS 를 우회하므로 식별자만 바꿔 남의 원본 CSV 를 읽을 수 있다 (AGENTS.md CRITICAL).
- **전체 행을 응답에 담지 마라.** 이유: 화면에 필요한 것은 10행이고, 나머지는 브라우저로 나갈 이유가 없다.
- **시도 상한을 늘리거나 없애지 마라.** 이유: 상한 3회가 이 경로에 게이트를 걸지 않고도 남용을 막는 유일한 장치다 (ADR-001).
- **파일 본문을 이 화면에서 다시 업로드하게 만들지 마라.** 이유: 원본은 이미 Storage 에 있다. 필요한 것은 컬럼 선택뿐이다.
- **fingerprint 를 이 화면에서 저장하지 마라.** 이유: 수동 확정한 매핑도 sanity check 를 통과한 뒤 워커가 저장한다 (ADR-001).
- 기존 테스트를 깨뜨리지 마라.
- 커밋하지 마라. execute.py 가 처리한다.
