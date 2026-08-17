# Step 7: inngest-pipeline

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — **"업로드 파이프라인" 전체와 그 아래 다섯 문단, "두 종류의 실패", "중복 방지", "AI 리뷰", "외부 진입점" 이 이 step 의 단일 출처다**
- `/docs/ADR.md` — **ADR-010(스텝을 잘게 쪼갠다)** · ADR-001(두 종류의 실패) · ADR-005(쓰기 게이트) · ADR-008(모델 분리) · ADR-012(서술 배치 범위)
- `/docs/USER_FLOW.md` — "상태 머신 1", 완료 요약 규칙, S6 · S9~S15 · S24b · S25 · S28 · S33
- `/AGENTS.md` — 외부 진입점 서명 검증 · Storage 키 · 배치 단위 · 전역 캐시 관련 CRITICAL 규칙

이전 step 에서 만들어진 파일을 **전부 읽고 시그니처를 확인한 뒤** 작업하라:

- `src/lib/csv/*` — 인코딩 · 파싱 · 매핑 적용 · 날짜 · 금액 · sanity check · dedupe_key
- `src/lib/merchant.ts` · `src/lib/merchant-rules.ts` · `src/lib/classify.ts`
- `src/lib/signals/*` — `thresholds.ts` · `queries.ts` · `detect-*.ts` · `index.ts`
- `src/services/openai.ts` — `OPENAI_MODELS` · `CLASSIFY_BATCH_SIZE` · `classifyMerchantBatch` · `inferColumnMapping`
- `src/services/supabase.ts` — service role 클라이언트
- `src/lib/entitlement.ts` — `evaluateEntitlement`
- `supabase/migrations/*.sql` — 테이블 · enum · 집계 함수 이름

**이 step 은 새 로직을 거의 만들지 않는다. 이미 만들어진 순수 함수들을 순서대로 엮고, 상태를 DB 에 반영하고, 외부 경계를 지키는 것이 전부다.**

## 작업

### 1. `src/app/api/uploads/signed-url/route.ts` — 업로드 시작

- 로그인 확인 → **`evaluateEntitlement` 로 쓰기 권한 확인**. `expired` 면 거부한다 (ADR-005)
- **Storage 키의 파일명을 서버가 생성한다.** 클라이언트가 보낸 파일명은 `upload_jobs.original_filename` 컬럼에만 저장한다. 이유: 클라이언트가 키 문자열을 정하면 다른 사용자 경로에 쓸 수 있고 서명이 그 조작을 승인해 버린다 (AGENTS.md CRITICAL)
- 경로는 `{user_id}/{job_id}/{서버가 생성한 파일명}`
- 크기 · MIME 제한을 여기서 건다. 버킷은 private
- 클라이언트가 함께 보낸 `card_label` 을 여기서 저장한다. **비어 있으면 거부한다** (`dedupe_key` 구성 요소라 비울 수 없다)
- `upload_jobs` 를 `pending` 으로 만든다

### 2. `src/app/api/uploads/[id]/start/route.ts` — 워커 기동

소유자 확인 후 Inngest 이벤트를 발행한다. 이미 진행 중인 job 을 다시 기동하지 않는다.

### 3. `src/app/api/uploads/[id]/route.ts` — 조회 · 삭제

- `GET`: job 상태와 완료 요약을 돌려준다. 대시보드 진행률 카드가 폴링한다 (S6 · S25)
- `DELETE`: job row 와 **Storage 객체**를 함께 지운다. 원본 파일이 남으면 안 된다 (ADR-009)

### 4. `src/app/api/uploads/[id]/mapping/route.ts` — 수동 매핑 확정

- job 이 `needs_mapping` 일 때만 받는다
- 사용자가 고른 컬럼으로 `csv.mapping_confirmed` 이벤트를 발행해 **7단계부터 재개**한다
- **시도 횟수에 상한을 둔다.** 상한에 닿으면 "이 파일은 읽을 수 없습니다" 로 끝낸다 (S10 · ADR-001)

**위 4개 라우트 전부 매 요청 job 소유자를 확인한다.** 이유: 워커는 service role 로 돌아 RLS 를 우회하므로, 소유권 확인이 라우트 계층의 유일한 방어선이다. 식별자만 바꿔 남의 업로드를 조작할 수 있다 (AGENTS.md CRITICAL).

**`route.ts` 는 TDD Guard 검사 대상이다.** 각 라우트마다 같은 폴더에 `route.test.ts` 를 먼저 만들어라.

### 5. `src/app/api/inngest/route.ts`

- Inngest signing key 로 검증한다. 검증을 통과한 요청만 처리한다
- **Node 런타임으로 고정하고 `maxDuration` 을 명시한다.** CSV 파싱과 인코딩 변환이 Node API 에 의존해 Edge 를 쓸 수 없다 (ARCHITECTURE "패턴")
- 미들웨어가 이 경로를 막지 않는지 확인해라 (step 3 에서 매처를 제외했다)

### 6. `src/inngest/process-upload.ts` — 파이프라인

ARCHITECTURE "업로드 파이프라인" 의 5~11단계를 **Inngest 스텝으로 나눠** 구현한다.

```
5. 파일 다운로드 → 인코딩 감지 → 헤더 해시 계산·저장
     같은 card_label 의 기존 job 과 해시가 다르면 카드 오지정 경고 플래그 (중단하지 않음, S24b)
6. fingerprint 조회. 히트면 캐시된 매핑, 미스면 inferColumnMapping(terra)
7. 매핑을 20행에 적용 → 성공률 90% 미만이면 needs_mapping 후 중단
     날짜가 숫자 구분 형식이면 전체 행을 스캔해 MM/DD·DD/MM 판별
8. 전 행 파싱 → 실패율 20% 초과면 needs_mapping 으로 되돌림
     → sanity check → 통과면 거래 저장 + (미스였다면) fingerprint 저장
                     → 실패면 status = failed + failed_reason, fingerprint 저장 안 함
9. 미매칭 고유 가맹점 100개 배치 분류(luna) → merchant_categories.  **배치 1개당 스텝 1개**
10. 그 파일이 포함하는 모든 달의 신호 재계산(SQL + detect 함수) → spending_signals
11. 신호 서술 배치 1회(terra) → narrative → status = completed
```

반드시 지킬 것:

- **스텝 하나가 Vercel 함수 호출 하나다.** 9단계에서 배치를 한 스텝 안에서 루프로 돌지 마라 — 가맹점 수에 비례해 죽는다. 배치 수만큼 스텝을 돌려 각 호출이 OpenAI 1회분으로 고정되게 하고, 배치 하나가 실패하면 그것만 재시도되게 한다 (ADR-010)
- **스텝의 반환값에 거래 데이터를 담지 마라.** 개수 · id 목록 같은 최소 메타만 반환한다. 이유: Inngest 스텝의 반환값은 Inngest 인프라에 저장되므로 개인 금융 데이터가 외부 서비스에 남는다 (ARCHITECTURE)
- **거래 삽입은 `ON CONFLICT (dedupe_key) DO NOTHING` 이다.** 조회로 존재를 확인한 뒤 넣는 방식으로 구현하지 마라 — 재시도가 전제인 파이프라인이라 두 트랜잭션이 동시에 "없음"을 보고 둘 다 넣는다. `duplicate_count` 는 **삽입 시도 수와 실제 삽입 수의 차이**로 센다
- **분류 배치가 3회 재시도 후에도 실패하면 그 가맹점만 `기타` 로 두고 job 은 성공 처리한다.** 이때 해당 거래에 **`category_fallback = true`** 를 표시한다 — 신호 탐지가 이 건을 제외한다 (S13)
- **fingerprint 는 sanity check 를 통과한 뒤에만 저장한다.** 수동 확정한 매핑도 마찬가지다 (ADR-001)
- **`needs_mapping` 은 행이 안 읽힌 모든 경우다.** 7단계에서 걸리든 8단계에서 걸리든 원인이 같으므로 처리도 같다. `failed` 는 컬럼을 다시 골라도 소용없는 경우(sanity check)뿐이다
- 완료 요약은 **네 숫자**를 전부 기록한다: `inserted_count` · `duplicate_count` · `skipped_rows` · `uncategorized_count`. **"새로 추가된 거래 0건" 도 반드시 기록한다** (USER_FLOW "완료 요약 규칙")
- 10단계는 **그 파일이 포함하는 모든 달**을 재계산한다. 같은 달을 다시 올려도 기존 신호를 지우지 않고 새로 발생한 것만 추가한다 — `(user_id, type, period, target_key)` UNIQUE 가 중복을 막는다 (S33)
- 11단계 서술 배치는 **`impact` 가 있는 신호를 전부** 서술한다. **상위 3개만 고르지 마라** — 카드는 그중 3개를 보여줄 뿐이고 나머지는 AI 리뷰 화면이 읽는다. 배치 1회의 비용은 신호 개수가 아니라 호출 횟수에서 나온다 (ADR-012). `recurring_payment` 은 배치에 넣지 않는다(`narrative` 없이 SQL 로만 렌더)

### 7. `src/services/openai.ts` 에 `describeSignals` 추가

```ts
export async function describeSignals(signals: SignalForNarrative[]): Promise<Record<string, string>>
```

- 모델은 `OPENAI_MODELS.narrative` 다
- **LLM 은 주어진 숫자를 문장으로 엮기만 한다. 어떤 수치도 계산하거나 생성하지 마라.** 프롬프트에 이미 계산된 금액·비율을 넣고, 모델에게 계산을 요구하지 마라 (AGENTS.md CRITICAL)
- 가맹점명은 `sanitizeMerchantName` 을 거쳐 싣는다
- 서술이 실패하거나 일부 신호가 누락돼도 `narrative` 를 NULL 로 두고 job 은 진행한다. 화면은 `payload` 의 집계값을 렌더하므로 문장이 없어도 숫자는 보인다

### 8. 테스트

OpenAI 와 Supabase 는 전부 모킹한다. 최소한 아래를 고정하라:

- 라우트 4종이 **다른 사용자의 job id 로 접근하면 거부**한다
- `signed-url` 이 **클라이언트가 준 파일명을 Storage 키에 쓰지 않는다**
- `signed-url` 이 `expired` 사용자를 거부한다
- 같은 파일을 두 번 처리해도 `inserted_count` 가 두 번 늘지 않는다 (dedupe)
- 7단계 성공률 89% → `needs_mapping`, 8단계 실패율 21% → `needs_mapping`, sanity 실패 → `failed`
- **`failed` 와 `needs_mapping` 어느 쪽에서도 fingerprint 가 저장되지 않는다**
- 가맹점 250개면 분류 스텝이 **3번** 돈다 (100 · 100 · 50)
- 서술 배치가 `impact IS NOT NULL` 인 신호를 **전부** 담는다 (3개로 잘리지 않는다)
- 분류 배치 실패 시 해당 거래에 `category_fallback` 이 선다

## Acceptance Criteria

```bash
supabase db reset   # 마이그레이션 적용 성공 (로컬)
npm run build       # 컴파일 에러 없음
npm run lint        # 경고 0
npm test            # 라우트 · 파이프라인 테스트 포함 전부 통과 (실제 API 호출 0회)
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 라우트 4종 전부 소유자를 확인하는가?
   - Storage 키의 파일명을 서버가 만드는가?
   - 한 스텝 안에서 LLM 배치를 루프로 돌지 않는가?
   - 스텝 반환값에 거래 데이터가 없는가?
   - 삽입이 `ON CONFLICT DO NOTHING` 인가?
   - 서술 배치가 상위 3개로 잘리지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-foundation/index.json` 의 step 7 을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 phase 가 알아야 할 것: 라우트 경로와 응답 형태, job 상태 폴링 방법, 이벤트 이름)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **원본 파일을 Next.js 서버로 통과시키지 마라.** 이유: 클라이언트가 서명 URL 로 Storage 에 직접 올리고 읽기는 워커만 한다 (AGENTS.md CRITICAL). 라우트에서 파일 본문을 받는 엔드포인트를 만들지 마라.
- **거래 1건당 LLM 을 호출하지 마라.** 이유: 개인 가계부는 객단가가 낮아 거래당 LLM 비용이 곧 마진이다.
- **cron · 스케줄러 · 정리 job 을 만들지 마라.** 이유: Inngest 함수는 업로드 처리 하나뿐이다. 원본 CSV 삭제 크론도, 체험 만료 크론도 없다 (ARCHITECTURE "백그라운드").
- **월간 리포트를 자동 생성하지 마라.** 이유: 한 달치를 나눠 올리는 사용자에게 업로드 횟수만큼 버려지는 LLM 호출이 발생한다. 재생성은 사용자가 누른다 (ADR-006).
- **분류 수정 시 신호를 다시 계산하는 코드를 만들지 마라.** 이유: 신호는 업로드 시점에만 만들어진다 (S37).
- **UI 를 만들지 마라 — 업로드 다이얼로그 · 진행률 카드 · 완료 요약 · 컬럼 선택 화면.** 이유: 화면은 다음 phase 의 몫이고, 이 step 은 그 화면들이 부를 API 와 워커까지다. 이 step 이 끝나면 업로드 파이프라인은 API 로 검증 가능해야 한다.
- **Polar · 결제 · 웹훅 코드를 만들지 마라.** 이유: 다음 phase 다.
- 기존 테스트를 깨뜨리지 마라.
- 커밋하지 마라. execute.py 가 처리한다.
