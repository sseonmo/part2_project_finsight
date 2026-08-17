# Step 2: db-schema

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — **"데이터 모델" 표가 이 step 의 단일 출처다.** "중복 방지 — dedupe_key", "AI 리뷰", "외부 진입점" 도 읽어라
- `/docs/ADR.md` — ADR-002(fingerprint 개인 범위) · ADR-003(dedupe_key) · ADR-009(원본 보관과 계정 삭제)
- `/docs/USER_FLOW.md` — "상태 머신 1"(`upload_jobs.status` 6종), "상태 머신 2"(`subscription_status` 3종)
- `/docs/PRD.md` — "카테고리 10종", "신호 5종"(`type` 값)
- `/AGENTS.md` — RLS · 전역 캐시 · fingerprint 관련 CRITICAL 규칙

이전 step 에서 만들어진 파일:

- `src/lib/categories.ts` — 카테고리 10종. **DB enum 은 이 목록과 정확히 일치해야 한다**
- `package.json` · `vitest.config.ts` · `tsconfig.json`

## 작업

Supabase 로컬 스택 위에서 스키마와 RLS 를 세운다. **원격 프로젝트에는 아무것도 push 하지 않는다** (아래 금지사항).

### 1. Supabase 프로젝트 초기화

- `supabase init` 으로 `supabase/config.toml` 을 만든다
- 로컬 스택을 띄운다: `supabase start`. 이미 떠 있으면 그대로 쓴다
- **Docker 이미지 다운로드가 오래 걸려 진행할 수 없으면 `blocked` 로 기록하고 멈춰라.** 임의로 스키마 검증을 건너뛰고 completed 로 만들지 마라

### 2. 마이그레이션 — 테이블 8종

`supabase/migrations/` 아래에 타임스탬프 접두 파일로 나눠 작성한다 (예: `..._init.sql`, `..._rls.sql`, `..._storage.sql`).

ARCHITECTURE "데이터 모델" 표의 8개 테이블을 전부 만든다. 표에 적힌 컬럼·PK·UNIQUE·nullable 을 그대로 옮기고, 아래는 **반드시** 지킨다:

- **`transactions.dedupe_key` 에 UNIQUE 제약을 건다.** 이유: 중복을 막는 것은 애플리케이션 조회가 아니라 이 제약이다. 워커 스텝이 재시도되면 두 트랜잭션이 동시에 "없음"을 보고 둘 다 삽입한다 (ARCHITECTURE "중복 방지")
- **`merchant_categories` 는 전역 캐시다. `user_id` · 금액 · 날짜 컬럼을 넣지 마라.** 컬럼은 `merchant_normalized`(PK) 와 `category` 뿐이다
- **`csv_format_fingerprints` 의 PK 는 `(user_id, header_hash)` 다.** 전역 키로 만들지 마라 (ADR-002)
- **`upload_jobs.card_label` 은 NOT NULL 이다** (ADR-003 — `dedupe_key` 구성 요소라 비울 수 없다)
- `spending_signals` 에 **`target_key` 컬럼**을 두고 `(user_id, type, period, target_key)` 에 UNIQUE 를 건다. ARCHITECTURE 가 "대상 키"라고 부른 것이 이 컬럼이다 — `category_spike` 면 카테고리명, `recurring_*` 이면 정규화 가맹점명처럼 신호가 가리키는 대상의 식별자가 들어간다. `impact` 와 `narrative` 는 **nullable** 이다 (`recurring_payment` 의 `impact` 는 NULL 이고, 선정 쿼리가 `impact IS NOT NULL` 로 거른다)
- `transactions.amount` 는 **항상 양수**다. CHECK 제약으로 강제한다. 환불·취소는 `transaction_type = 'refund'` 로 구분한다
- **`transactions.category` 는 nullable 이다.** 이유: 파이프라인이 거래를 먼저 저장하고(8단계) 분류를 나중에 한다(9단계). NOT NULL 로 두면 저장 시점에 아직 없는 값을 채워 넣게 된다
- **`transactions` 에 `category_fallback boolean NOT NULL DEFAULT false` 를 둔다.** 이유: 분류 배치가 3회 재시도 후에도 실패하면 그 가맹점만 `기타` 로 두고 job 은 성공 처리하는데, **이렇게 대체된 건은 신호 탐지에서 제외해야 한다**(ARCHITECTURE "업로드 파이프라인"). 구분할 컬럼이 없으면 실패가 몰린 달에 `기타` 가 급증한 것이 그대로 신호로 올라간다. 신호 집계 쿼리(step 6)가 이 컬럼으로 거른다
- `spending_signals.period` 는 **그 신호를 뒷받침하는 관측 구간의 마지막 달**이다. 월 단위 값이므로 그 달의 1일을 가리키는 `date` 로 두어라 — 문자열로 두면 정렬과 범위 조회가 사전순에 의존한다
- 값이 고정된 목록은 DB 레벨에서 강제한다(enum 타입 또는 CHECK): 카테고리 **10종**(PRD) · `transaction_type` **3종**(`expense` `refund` `deposit`) · `upload_jobs.status` **6종**(USER_FLOW 상태 머신 1) · `subscription_status` **3종**(`trialing` `active` `canceled`) · `spending_signals.type` **5종**(PRD 신호 표의 키)
- `subscription_status` 에 `expired` 를 넣지 마라. 이유: `expired` 는 저장되는 상태가 아니라 `entitlement.ts` 가 매 요청 계산하는 결과다 (USER_FLOW "상태 머신 2")
- 조회 패턴에 맞는 인덱스를 건다: 거래는 `(user_id, transacted_on)` 과 `(user_id, merchant_normalized)`, 신호는 `(user_id, period)`, job 은 `(user_id, status)`
- 사용자 데이터 테이블은 전부 `ON DELETE CASCADE` 로 `auth.users` 에 연결한다. 이유: 계정 삭제가 원본 데이터의 유일한 삭제 경로다 (ADR-009)

### 3. RLS

- **사용자 데이터 테이블 7종 전부**에 RLS 를 켜고 `user_id = auth.uid()` 정책을 건다 (select · insert · update · delete)
- `merchant_categories` 만 예외다: **읽기는 authenticated 전체 허용, 쓰기 정책은 만들지 않는다.** 쓰기는 service role 이 RLS 를 우회해 수행한다 (AGENTS.md CRITICAL)
- RLS 를 켜지 않은 사용자 테이블이 하나라도 남으면 안 된다. 워커가 service role 로 도는 이 아키텍처에서 RLS 는 사용자 간 격리의 유일한 방어선이다

### 4. Storage 버킷

- `.env` 의 `SUPABASE_STORAGE_BUCKET` 이름으로 **private 버킷**을 만드는 마이그레이션을 둔다 (`public = false`)
- 경로 규약은 `{user_id}/{job_id}/{서버가 생성한 파일명}` 이다. storage 객체 정책은 **경로 첫 세그먼트가 `auth.uid()` 인 것만** 접근 가능하게 건다
- 버킷 이름을 SQL 에 하드코딩하지 말고 `.env` 값과 일치시켜라. 값이 다르면 step 7 이 조용히 실패한다

### 5. 타입 생성

- `supabase gen types typescript --local` 결과를 `src/types/database.ts` 에 저장한다
- 이 파일은 생성물이다. 손으로 고치지 마라

### 6. 테스트 — `supabase/rls.test.ts`

마이그레이션 SQL **파일 텍스트를 읽어** 검사하는 테스트를 쓴다. DB 접속이 필요 없어야 하고(로컬 스택이 꺼져 있어도 통과), 아래를 고정한다:

- 사용자 데이터 테이블 7종 각각에 `ENABLE ROW LEVEL SECURITY` 와 정책이 존재한다
- `merchant_categories` 에 `user_id` · `amount` · `날짜` 컬럼이 **없다**
- `transactions` 의 `dedupe_key` 에 UNIQUE 가 있다
- `csv_format_fingerprints` 의 PK 가 `(user_id, header_hash)` 다
- `upload_jobs.card_label` 이 NOT NULL 이다
- 카테고리 제약에 쓰인 10개 값이 `src/lib/categories.ts` 의 `CATEGORIES` 와 일치한다

이 테스트는 CRITICAL 규칙을 코드로 고정하는 것이 목적이다. "SQL 을 파싱해 AST 를 만들라"는 뜻이 아니다 — 정규식으로 충분하다.

## Acceptance Criteria

```bash
supabase db reset   # 마이그레이션 전부 적용 성공 (로컬)
npm run build       # 컴파일 에러 없음
npm run lint        # 경고 0
npm test            # rls 테스트 포함 전부 통과
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE "데이터 모델" 표의 8개 테이블이 전부 있는가?
   - RLS 가 빠진 사용자 테이블이 없는가?
   - `merchant_categories` 에 개인 데이터 컬럼이 섞이지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-foundation/index.json` 의 step 2 를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step 이 알아야 할 것: 마이그레이션 파일명, enum 타입 이름, `database.ts` 의 주요 타입명)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **`supabase link` · `supabase db push` · `supabase login` 을 실행하지 마라.** 이유: 대화형 인증이 필요해 세션이 타임아웃까지 멈춘다. 원격 반영은 사용자가 별도로 수행한다. 이 step 의 검증은 **로컬 스택까지**다.
- **`.env` 의 원격 URL·키로 원격 DB 에 접속하지 마라.** 이유: 검증되지 않은 마이그레이션이 실 데이터에 적용된다.
- **시드 데이터를 넣지 마라.** 이유: 가맹점 시드 룰은 테이블이 아니라 `src/lib/merchant-rules.ts` 상수이고(ARCHITECTURE "가맹점 분류"), step 5 가 만든다. 마이그레이션·시드 SQL·조회 쿼리를 통째로 없애기로 한 결정이다.
- **웹훅 멱등 테이블 · 카드 목록 테이블을 만들지 마라.** 이유: 카드 목록은 `SELECT DISTINCT card_label FROM upload_jobs` 가 대신하고(ARCHITECTURE), 웹훅 멱등은 결제를 다루는 다음 phase 의 몫이다.
- **`src/lib/` · `src/services/` 에 DB 쿼리 헬퍼를 만들지 마라.** 이유: Supabase 클라이언트는 step 3 이, 집계 쿼리는 step 6 이 담당한다.
- **`src/types/database.ts` 를 손으로 작성하지 마라.** 생성 명령의 출력을 그대로 쓴다.
- 기존 테스트를 깨뜨리지 마라.
- 커밋하지 마라. execute.py 가 처리한다.
