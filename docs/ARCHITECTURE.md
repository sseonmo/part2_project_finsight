# 아키텍처

## 디렉토리 구조
```
src/
├── app/
│   ├── globals.css          # 디자인 토큰 (라이트/다크 두 벌)
│   ├── (marketing)/         # 랜딩 — 비로그인 접근 가능
│   ├── (app)/               # 대시보드 계열 — 로그인 필수
│   └── api/                 # 라우트 핸들러 (webhook, signed-url, inngest)
├── components/
├── types/
├── lib/
│   ├── entitlement.ts       # 체험·구독 권한 판정 (유일한 게이트)
│   ├── categories.ts        # 카테고리 10종 enum + 색 토큰명 매핑
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
   클라이언트가 함께 보낸 card_label 을 여기서 저장한다 (dedupe_key 구성 요소)
3. 클라이언트가 서명 URL로 Supabase Storage에 직접 업로드 (Next 서버를 통과하지 않는다)
4. 클라이언트가 /api/uploads/:id/start 호출 → Inngest 이벤트 발행
5. [워커] 파일 다운로드 → 인코딩 감지(UTF-8 / EUC-KR / CP949) → 헤더 해시 계산·저장
      같은 card_label 의 기존 job과 해시가 다르면 카드 오지정 경고 플래그를 세운다(중단하지 않음)
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
sha256(user_id | card_label | transacted_on | amount | merchant_normalized | occurrence)
```
`occurrence` = **같은 파일 안에서 (날짜, 금액, 정규화 가맹점명) 조합이 몇 번째로 등장했는지**(0부터).
`card_label` = 업로드할 때 사용자가 고른 카드(`upload_jobs.card_label`).

- 같은 파일을 다시 올려도 키가 동일 → 중복 삽입되지 않는다
- **기간이 겹치는 다른 파일**(3월치 / 3~4월치)을 올려도 겹치는 거래의 키가 동일 → 중복되지 않는다
- 같은 날 같은 가게에서 같은 금액을 두 번 쓴 **진짜 2건**은 occurrence 0/1로 구분되어 보존된다
- **다른 카드의 명세서에 있는 같은 조합**(3/4·4,500원·스타벅스)도 `card_label` 이 달라 보존된다

**`card_label` 이 키에 있어야 하는 이유** — `occurrence` 는 파일 안에서만 세므로, 카드 A와 카드 B의 3월 명세서에 같은 조합이 1건씩 있으면 **양쪽 다 `occurrence = 0`** 이 되어 키가 완전히 같아진다. 그러면 두 번째 파일의 진짜 거래가 `ON CONFLICT DO NOTHING` 으로 버려지고 화면에는 "중복이라 건너뛴 거래"로 보고된다 — **진짜 2건이 1건으로 줄어드는데 사용자는 중복이 제거된 줄 안다.** `merchant_normalized` 가 지점 코드를 지우므로 강남점과 종로점도 같은 이름이 되어 충돌 확률이 더 오른다. 대상 사용자가 카드 1~4장인 이상(PRD) 이것은 예외가 아니라 정상 경로다.

중복을 막는 것은 **`dedupe_key` 의 UNIQUE 제약이고, 삽입은 `ON CONFLICT (dedupe_key) DO NOTHING` 이다.** 조회로 존재를 확인한 뒤 넣는 방식으로 구현하지 말 것 — 같은 파일을 두 번 올리거나 워커 스텝이 재시도되면 두 트랜잭션이 동시에 "없음"을 보고 둘 다 넣는다. 재시도가 전제인 파이프라인이라 실제로 발생한다. `duplicate_count` 는 삽입 시도 수와 실제 삽입 수의 차이로 센다.

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
- **배치는 `impact` 가 있는 신호를 전부 서술한다. 카드에 올라갈 상위 3개만 고르지 않는다.** 카드는 그중 3개를 보여줄 뿐이고 나머지는 AI 리뷰 화면이 읽는다(ADR-012). 배치를 3개로 줄이면 호출 비용은 그대로인데 리뷰 화면이 빈 문장을 갖게 된다 — 배치 1회의 비용은 신호 개수가 아니라 호출 횟수에서 나온다
- `period` 는 그 신호를 뒷받침하는 관측 구간의 **마지막 달**이다. 반복 지출 목록은 `(user_id, type, 대상 키)` 별 최신 `period` row 하나만 읽는다
- 같은 달을 다시 올려도 기존 신호를 지우지 않고 새로 발생한 것만 추가한다(`(user_id, type, period, 대상 키)` 유니크)
- 전월 지출이 0인 카테고리는 `category_spike` 의 분모가 0이라 제외한다. 0원 거래(포인트 전액 결제)도 비율 계산에서 뺀다

신호는 **다섯 표면**에 나타난다. 설계 초안은 셋이었고, 핸드오프 프로토타입이 AI 리뷰 화면과 신호 상세를 더했다 (ADR-012).

| 표면 | 무엇을 보여주는가 | LLM |
|---|---|---|
| 대시보드 인사이트 카드 | 가장 최근 달의 `impact` 상위 **3개**. `recurring_payment` 제외 | 업로드당 배치 1회 |
| AI 리뷰 `/dashboard/review/[yearMonth]` | 그 달 신호 **전부** + 반복 결제 목록 | 위 배치의 `narrative` 재사용. 추가 호출 0회 |
| 신호 상세 `/dashboard/review/[yearMonth]/[signalId]` | 근거 거래 + 판정 조건 + 임계값 해설 | **0회** — 전부 SQL과 `thresholds.ts` 상수 |
| 월간 리포트 코칭 문단 | 한 달치를 서술형으로 | 리포트 생성 시 1회 (ADR-006) |
| 반복 지출 목록 `/dashboard/subscriptions` | `recurring_*` 만 | **0회** |

**AI 리뷰 화면과 신호 상세는 LLM을 추가로 호출하지 않는다** (ADR-012). 인사이트 카드가 상위 3개만 보여주는 대신, 나머지 신호는 이미 저장된 `narrative` 를 그대로 읽어 리뷰 화면에 쌓는다. 신호 상세의 "왜 이 조건인가" 문구는 신호 종류별 고정 문자열이고 `thresholds.ts` 의 값을 그 문장에 끼워 넣는다 — 임계값을 바꾸면 화면 문구가 함께 바뀌어야 하므로 문구를 상수 옆에 둔다.

리뷰 화면과 상세 화면은 **읽기이므로 `expired` 에서도 열린다** (ADR-005).

## 데이터 모델
| 테이블 | 핵심 컬럼 | RLS |
|---|---|---|
| `profiles` | `user_id` PK, `trial_started_at`, `subscription_status`, `polar_customer_id`, `current_period_end` | 본인만 |
| `upload_jobs` | `id`, `user_id`, `storage_key`, `original_filename`, `card_label` **NOT NULL**, `header_hash`, `status`, `mapping` jsonb, `failed_reason`, 완료 요약 4종(`inserted_count`, `duplicate_count`, `skipped_rows`, `uncategorized_count`) | 본인만 |
| `transactions` | `id`, `user_id`, `upload_job_id`, `transacted_on`, `amount`, `merchant_raw`, `merchant_normalized`, `category`, `transaction_type`, `dedupe_key`. `dedupe_key` **UNIQUE** | 본인만 |
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
- **카드 목록은 테이블로 두지 않는다.** `SELECT DISTINCT card_label FROM upload_jobs WHERE user_id = ?` 가 곧 그 사용자의 카드 목록이다. 테이블·마이그레이션·CRUD 화면이 통째로 사라지고, 카드는 업로드가 있어야 존재하므로 고아 레코드도 생기지 않는다
- **`card_label` 오지정 방어**: 5단계에서 계산한 `header_hash` 를 `upload_jobs` 에 저장하고, **같은 `card_label` 로 올린 기존 job과 해시가 다르면** 완료 요약에 "이 파일은 '카드 1'로 올린 이전 파일과 형식이 다릅니다. 다른 카드라면 삭제 후 카드를 바꿔 올려주세요"를 함께 띄운다. job을 멈추지는 않는다. 카드사가 다르면 CSV 헤더도 다르므로, 이미 계산하는 값 하나로 오지정을 잡을 수 있다. 이 방어가 없으면 사용자가 두 번째 카드 파일을 기본값 그대로 올렸을 때 `card_label` 을 키에 넣은 효과가 사라진다
- `csv_format_fingerprints` 의 키는 `card_label` 과 무관하게 `(user_id, header_hash)` 그대로다. 형식 캐시는 "이 헤더를 어떻게 읽는가"이지 "누구 카드인가"가 아니다
- 조회 시 카테고리는 `user_category_overrides` → `merchant_categories` 순으로 결정한다
- Storage 경로는 `{user_id}/{job_id}/{서버가 생성한 파일명}`. 다운로드는 소유자 확인 후 60초 서명 URL로만 내보낸다

## 외부 진입점
`/api/inngest` 와 Polar 웹훅은 로그인 세션 없이 외부에서 호출되고 **service role로 DB에 쓴다 — RLS가 막아주지 않는다.** 서명 검증을 통과한 요청만 처리한다.

- **Polar 웹훅**: webhook secret으로 서명을 검증한다. 실패는 401이고 본문을 파싱하지 않는다. 검증이 없으면 `user_id`를 담아 POST하는 것만으로 결제 없이 구독이 켜진다
- **`/api/inngest`**: Inngest signing key로 검증한다
- **웹훅은 이벤트 ID로 멱등 처리한다.** 같은 이벤트가 재전송되면 두 번째는 무시한다. 없으면 재전송 한 번에 `current_period_end`가 두 번 연장된다
- **`/api/uploads/:id` 계열은 매 요청 job 소유자를 확인한다.** 식별자만 바꿔 남의 업로드를 조작할 수 있다

## 디자인 토큰

토큰은 `src/app/globals.css` 한 파일에 CSS 변수로 두고, 라이트를 `:root` 에, 다크를 `[data-theme="dark"]` 에 정의한다. Tailwind 유틸리티는 이 변수를 참조한다. **컴포넌트에 hex를 직접 쓰지 않는다.**

**출처는 핸드오프 프로토타입이다.** 번들에 들어 있는 `_ds/` 디자인 시스템은 **다른 제품용**이라 그대로 쓰지 않는다 — 스스로 밝히기를 "financial-insight platform for finance teams"용이고, "Known gaps: **No dark-mode token set**"이다. 무채색·간격·radius 토큰은 그 시스템에서 가져오고, 다크 팔레트와 카테고리 색은 프로토타입이 그 위에 얹은 것을 정본으로 삼는다.

### 카테고리 색 10종

카테고리 enum과 색은 `src/lib/categories.ts` 한 곳에서 나온다. 도넛·막대·행 점·필터 칩이 전부 이 매핑을 읽는다.

| 카테고리 | 라이트 | 대응 토큰 |
|---|---|---|
| 식비 | `#F2735A` | `--brand-coral` |
| 카페/간식 | `#E8B818` | `--brand-yellow-deep` |
| 생활/마트 | `#1F9C8B` | `--brand-teal` |
| 교통 | `#2557E6` | `--brand-blue` |
| 주거/통신 | `#6B4FD8` | 신규 |
| 쇼핑 | `#D9508B` | 신규 |
| 의료/건강 | `#17A46A` | `--success-accent` |
| 문화/여가 | `#E07A2F` | 신규 |
| 금융/보험 | `#56566B` | `--slate` |
| 기타 | `#A8A8B8` | `--muted` |

**세 값은 의미가 겹친다.** `--brand-blue` 는 디자인 시스템에서 링크·포커스 링 전용이고, `--success-accent` 는 증감 표시의 "감소"에 쓰인다 — 같은 대시보드 행에서 의료/건강 점과 감소 화살표가 같은 초록이 된다. 카테고리 색은 별도 변수(`--cat-*`)로 복제해 두고, 값이 겹치더라도 **용도가 다른 변수를 통해 참조한다.** 나중에 한쪽만 바꿀 수 있어야 한다.

**다크에서 카테고리 색은 그대로 두지 않는다.** 프로토타입은 다크 블록에서 이 10색을 재정의하지 않는데, `#56566B`(금융/보험)와 `#2557E6`(교통)은 `#14141C` 캔버스 위에서 거의 읽히지 않는다. 다크용 10색을 따로 정의한다.

### 다크 모드

`prefers-color-scheme` 을 기본으로 따르고 수동 토글로 덮어쓴다 (PRD "라이트/다크 두 벌, 시스템 설정을 따른다").

- **`data-theme` 을 클라이언트에서 세팅하지 않는다.** 프로토타입은 마운트 후 `matchMedia` 로 판정하는데, SSR에서 그렇게 하면 첫 페인트가 라이트로 깜빡인다. `<html>` 에 인라인 스크립트로 `localStorage` 값을 먼저 적용한다
- 다크 팔레트 실값은 프로토타입 HTML의 `[data-theme="dark"]` 블록에 35개가 들어 있다. 이것이 정본이다

### 타이포그래피와 레이아웃

- **폰트는 미확정이다.** 디자인 시스템이 `Roobert PRO` 를 지정했으나 바이너리가 없어 **Hanken Grotesk**(Google Fonts)로 대체돼 있고, 시스템 문서가 교체 대상으로 표시했다. 한글 폰트는 아직 지정되지 않았다 — 화면 문구가 전부 한글이므로 이것부터 정해야 한다
- 앱 셸은 **236px 고정 사이드바 + sticky 헤더**다. 사이드바는 768~1023px에서 아이콘 레일로 접히고 480px 미만에서 사라진다
- 브레이크포인트: `<480` 1열 / `480~767` 2열 / `768~1023` 사이드바 축소·대시보드 2열 / `≥1024` 밀집형 2열
- 표는 모바일에서 지우지 않고 카드로 바꾼다. 터치 타깃 44px 이상

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
