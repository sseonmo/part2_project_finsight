# 아키텍처

## 디렉토리 구조
```
src/
├── app/
│   ├── (marketing)/         # 랜딩 — 비로그인 접근 가능
│   ├── (app)/               # 대시보드 계열 — 로그인 필수
│   └── api/                 # 라우트 핸들러 (webhook, signed-url, inngest)
├── components/
├── types/
├── lib/
│   ├── entitlement.ts       # 체험·구독 권한 판정 (유일한 게이트)
│   ├── csv/                 # 파싱·검증·정규화
│   ├── signals/             # 신호 5종 SQL + thresholds.ts
│   ├── merchant.ts          # 가맹점명 정규화
│   └── merchant-rules.ts    # 시드 룰 30개 상수
├── services/                # openai.ts, polar.ts, supabase.ts
└── inngest/                 # 백그라운드 함수
```

## 패턴
Server Components 기본. 인터랙션이 필요한 곳만 Client Component.
집계는 전부 SQL(Postgres)에서 하고, 클라이언트로는 이미 계산된 숫자만 내려보낸다.
파싱·정규화·신호 탐지는 외부 의존이 없는 순수 함수로 `src/lib/`에 두고 단위 테스트로 고정한다. 제품 정확도의 대부분이 이 계층에 있다.

- **날짜 계산은 `Asia/Seoul` 로 고정한다.** "이번 달"을 서버 시각(UTC)으로 계산하면 한국 시간 자정~오전 9시에 지난달 대시보드가 보인다
- **워커 라우트는 Node 런타임으로 고정한다.** CSV 파싱과 인코딩 변환이 Node API에 의존해 Edge 런타임을 쓸 수 없다. `/api/inngest` 에는 `maxDuration` 을 명시하고, Inngest 서버가 endpoint에 닿도록 Vercel Deployment Protection 설정을 확인한다
- **사용자 문자열이 LLM 프롬프트에 들어가는 지점은 전부 경계다.** 가맹점명은 길이 상한·제어문자 제거를 거치고, 출력은 스키마로 강제해 검증한다
- 신호 임계값은 `thresholds.ts` 하나에 모은다. 경계값(+49/+50/+51%)과 오탐 케이스를 고정 픽스처로 테스트한다
- 외부 API 호출은 `src/services/` 래퍼를 거친다. 테스트에서는 이 래퍼를 모킹한다

## 업로드 파이프라인
```
1. 클라이언트가 /api/uploads/signed-url 요청
2. 서버가 Storage 키를 생성(파일명은 서버가 정한다) + upload_jobs 레코드 pending 생성
   크기·MIME 제한도 여기서 건다. 버킷은 private
3. 클라이언트가 서명 URL로 Supabase Storage에 직접 업로드 (Next 서버를 통과하지 않는다)
4. 클라이언트가 /api/uploads/:id/start 호출 → Inngest 이벤트 발행
5. [워커] 파일 다운로드 → 인코딩 감지(UTF-8 / EUC-KR / CP949) → 헤더 해시 계산
6. [워커] fingerprint 조회. 히트하면 캐시된 매핑 사용, 미스면 LLM(terra)으로 컬럼 매핑 추론
7. [워커] 매핑을 20행에 적용 → 파싱 성공률 90% 미만이면 needs_mapping 후 중단
      날짜가 숫자 구분 형식이면 전체 행을 스캔해 MM/DD·DD/MM 을 판별한다
8. [워커] 전 행 파싱(메모리 적재)
      파싱 실패 행이 20%를 넘으면 needs_mapping 으로 되돌린다 (7단계 샘플이 운 좋게 통과한 경우)
      → sanity check
      통과 → 거래 저장 + (미스였다면) fingerprint 저장
      실패 → status = failed + failed_reason 기록, fingerprint 저장하지 않음
9. [워커] 미매칭 고유 가맹점을 100개씩 배치로 분류(luna) → merchant_categories
      **배치 1개당 스텝 1개**로 돌린다
10. [워커] 해당 파일이 포함하는 모든 달의 신호 재계산(SQL) → spending_signals
11. [워커] 신호 서술 배치 1회(terra) → 인사이트 문장 → status = completed
```

**스텝 하나가 Vercel 함수 호출 하나다.** Inngest가 파는 것은 실행시간이 아니라 재시도와 관측이다. 9단계에서 배치를 한 스텝 안에서 루프로 돌면 가맹점 수에 비례해 죽는다. 배치 수만큼 스텝을 돌리면 각 호출이 OpenAI 1회분으로 고정되고, 배치 하나가 실패해도 그것만 재시도된다 (ADR-010).

**Inngest 스텝의 반환값은 Inngest 인프라에 저장된다.** 스텝은 개수·id 목록 같은 최소 메타만 반환하고 거래 데이터 자체를 반환하지 않는다 — 개인 금융 데이터가 외부 서비스에 남지 않게 한다.

분류 배치가 3회 재시도 후에도 실패하면 해당 가맹점만 `기타`로 두고 job은 성공 처리한다. **단 이렇게 대체된 건은 신호 탐지에서 제외한다** — 실패가 몰린 달에 `기타`가 급증한 것처럼 보이기 때문이다.

`/api/uploads/:id` 계열(조회·시작·삭제)은 전부 job 소유자를 확인한 뒤 처리한다. 워커는 service role로 돌아 RLS를 우회하므로, 소유권 확인이 라우트 계층의 유일한 방어선이다.

### 두 종류의 실패 (ADR-001)
| 실패 | 판정 | 상태 | 처리 |
|---|---|---|---|
| 매핑이 틀렸다 | 7단계 20행 성공률 90% 미만, 또는 8단계 전 행 실패율 20% 초과 | `needs_mapping` | 컬럼 선택 UI → `csv.mapping_confirmed` 로 7단계부터 재개 |
| 데이터가 이상하다 | 아래 sanity check | `failed` | 사유를 보여주고 끝낸다 |

거래일이 전부 2035년인 파일에 대고 컬럼을 다시 고르라고 물어봐야 소용이 없다. 컬럼을 바꿔서 고칠 수 있는 실패만 묻는다. **행이 안 읽히는 것은 언제나 매핑 문제로 취급한다** — 판정 지점이 7단계든 8단계든 원인이 같으므로 처리도 같아야 한다.

### sanity check (8단계, 결정론적)
행은 읽혔지만 값이 말이 안 되는 경우다. 아래 중 하나라도 걸리면 그 업로드는 `failed`이고 **fingerprint를 저장하지 않는다.**

| 검사 | 임계 |
|---|---|
| 거래일이 미래이거나 10년 이전 | 5% 초과 |
| 금액이 0이거나 파싱 불가 | 30% 초과 |
| 유효 거래 수 | 0건 |

`failed_reason`은 사용자에게 그대로 보여준다. 사용자는 업로드 이력에서 삭제 후 다시 올릴 수 있다.
**`needs_mapping`에서 사용자가 확정한 매핑도 sanity check를 통과한 뒤에만 fingerprint에 저장한다.** 수동 매핑이 또 실패하면 다시 묻되 시도 횟수에 상한을 둔다.

## 중복 방지 — dedupe_key
```
sha256(user_id | transacted_on | amount | merchant_normalized | occurrence)
```
`occurrence` = **같은 파일 안에서 (날짜, 금액, 정규화 가맹점명) 조합이 몇 번째로 등장했는지**(0부터).

- 같은 파일을 다시 올려도 키가 동일 → 중복 삽입되지 않는다
- **기간이 겹치는 다른 파일**(3월치 / 3~4월치)을 올려도 겹치는 거래의 키가 동일 → 중복되지 않는다
- 같은 날 같은 가게에서 같은 금액을 두 번 쓴 **진짜 2건**은 occurrence 0/1로 구분되어 보존된다

파일 내 행 순번을 쓰지 않는 이유는 ADR-003. 8단계가 전 행을 메모리에 올리는 이유가 이것이다 — 조합을 세려면 파일 전체를 봐야 하고, sanity check의 비율 판정도 마찬가지다.

## 가맹점 분류
정규화 → 개인 오버라이드 → 전역 캐시 `merchant_categories` → 시드 룰 → LLM 배치 순으로 매칭한다.

- `merchant_normalized`: 공백 압축, 대문자화, 카드사가 붙이는 지점 코드·일련번호·PG사 접두어 제거. **이 함수의 품질에 캐시 적중률이 통째로 걸린다.** 카드사별 실제 가맹점명을 픽스처로 고정한다
- 시드 룰은 테이블이 아니라 `src/lib/merchant-rules.ts` 상수로 둔다. 마이그레이션·시드 SQL·조회 쿼리가 통째로 사라지고 순수 함수로 테스트할 수 있다. **개수는 대형 프랜차이즈 30개 안팎으로 제한한다** — 목적은 비용 절감이 아니라 분류 품질이다. 첫 업로드의 미매칭 300개는 3배치 15원이라 시드를 늘려 아끼는 금액이 미미한 반면, 스타벅스·GS25처럼 누구나 쓰는 곳을 LLM이 엉뚱하게 분류하면 사용자 눈에 바로 띈다. 자주 나오면서 틀리면 티 나는 것만 넣는다
- LLM 호출은 미매칭 고유 가맹점 100개 배치 단위로만 한다

## AI 리뷰
- 신호 탐지: `src/lib/signals/*.sql.ts` — 결정론적 SQL. LLM 관여 없음
- 우선순위: **원화 영향도 점수**. `recurring_payment` 은 `impact` 가 **NULL** 이고 카드·코칭 문단 선정 쿼리는 `impact IS NOT NULL` 을 조건에 넣는다
- LLM 역할: 선별된 신호 목록을 받아 문장으로 옮기기만 한다. 수치 계산·생성 금지, 무엇을 지적할지 선택 금지
- 호출 단위: 업로드당 배치 1회. `recurring_payment` 은 배치에 포함하지 않는다(`narrative` 없이 SQL로만 렌더)
- `period` 는 그 신호를 뒷받침하는 관측 구간의 **마지막 달**이다. 반복 지출 목록은 `(user_id, type, 대상 키)` 별 최신 `period` row 하나만 읽는다
- 같은 달을 다시 올려도 기존 신호를 지우지 않고 새로 발생한 것만 추가한다(`(user_id, type, period, 대상 키)` 유니크)
- 전월 지출이 0인 카테고리는 `category_spike` 의 분모가 0이라 제외한다. 0원 거래(포인트 전액 결제)도 비율 계산에서 뺀다

신호는 세 표면에 나타난다 — 업로드 직후 인사이트 카드(`impact` 있는 것 상위 3개), 월간 리포트 코칭 문단, 반복 지출 목록 `/dashboard/subscriptions`(LLM 0회).

## 데이터 모델
| 테이블 | 핵심 컬럼 | RLS |
|---|---|---|
| `profiles` | `user_id` PK, `trial_started_at`, `subscription_status`, `polar_customer_id`, `current_period_end` | 본인만 |
| `upload_jobs` | `id`, `user_id`, `storage_key`, `original_filename`, `status`, `mapping` jsonb, `failed_reason`, 완료 요약 4종(`inserted_count`, `duplicate_count`, `skipped_rows`, `uncategorized_count`) | 본인만 |
| `transactions` | `id`, `user_id`, `upload_job_id`, `transacted_on`, `amount`, `merchant_raw`, `merchant_normalized`, `category`, `transaction_type`, `dedupe_key` | 본인만 |
| `merchant_categories` | `merchant_normalized` PK, `category` | **전역** — 읽기 전체 허용, 쓰기는 service role만 |
| `user_category_overrides` | `(user_id, merchant_normalized)` PK, `category` | 본인만 |
| `csv_format_fingerprints` | `(user_id, header_hash)` PK, `mapping` jsonb | 본인만 |
| `spending_signals` | `id`, `user_id`, `period`, `type`, `payload` jsonb, `impact`(**nullable**), `narrative`(nullable), `upload_job_id`, `dismissed_at`. `(user_id, type, period, 대상 키)` 유니크 | 본인만 |
| `monthly_reports` | `(user_id, month)` PK, `narrative`, `generated_at` | 본인만 |

- 구독 상태는 별도 테이블로 빼지 않고 `profiles`에 둔다. `entitlement.ts`가 매 요청마다 `trial_started_at`과 `current_period_end`로 권한을 계산하는데, 두 값이 다른 테이블에 있으면 모든 요청에 조인이 붙는다
- `transaction_type` 은 **`expense` · `refund` · `deposit` 3종**이다. 지출 집계는 `expense` 만 넣는다. 카테고리 10종과 마찬가지로 이 목록이 유일한 출처이고, 파싱 단계에서 여기에 매핑되지 않는 행은 `expense` 로 두지 않고 건너뛴다
- `amount`는 **항상 양수**다. 환불·취소는 `transaction_type = 'refund'`로 구분한다
  → 집계 쿼리는 반드시 `transaction_type` 필터를 명시할 것. 누락하면 환불이 지출로 잡힌다
- `upload_jobs.mapping` 과 `csv_format_fingerprints.mapping` 에 같은 값이 들어간다. **둘 다 필요하다** — fingerprint는 sanity check를 통과한 뒤에만 저장되므로, `needs_mapping` 에서 재개하는 시점에는 아직 없다
- 조회 시 카테고리는 `user_category_overrides` → `merchant_categories` 순으로 결정한다
- Storage 경로는 `{user_id}/{job_id}/{서버가 생성한 파일명}`. 다운로드는 소유자 확인 후 60초 서명 URL로만 내보낸다

## 상태 관리
서버 상태는 Server Components + Supabase 직접 조회.
클라이언트 상태는 `useState`만. 전역 상태 라이브러리를 도입하지 않는다.
폴링은 `completed`·`failed`·`needs_mapping`에서 멈춘다.
LLM이 만든 문장(`narrative`)과 가맹점명은 React 기본 이스케이프로 렌더한다. `dangerouslySetInnerHTML`을 쓰지 않는다.

## 백그라운드
Inngest 함수는 **업로드 처리 하나뿐**이다. **cron 없음.**

- 원본 CSV는 계정 삭제 시까지 보관하므로 삭제 크론이 필요 없다 (ADR-009)
- 체험 만료도 크론을 쓰지 않는다. `entitlement.ts`가 매 요청 계산한다 — 크론으로 상태를 내리면 실행 지연만큼 무료 구간이 생기고, 크론이 죽으면 전원이 무제한이 된다
- 월간 리포트는 업로드가 자동 생성하지 않는다. 화면에 `generated_at`("3월 12일에 생성됨")과 "다시 만들기"를 항상 띄우고, 판단은 사용자가 한다 (ADR-006)

**계정 삭제가 원본 파일의 유일한 삭제 경로다.** 계정 삭제 시 DB row와 함께 `{user_id}/` 하위 Storage 객체를 전부 지운다. 이 경로가 없으면 보관 정책이 그대로 "영구 보관"이 된다.
