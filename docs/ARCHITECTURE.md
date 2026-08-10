# 아키텍처

## 디렉토리 구조
```
src/
├── app/               # 페이지 + API 라우트
├── components/        # UI 컴포넌트
├── types/             # TypeScript 타입 정의
├── lib/               # 유틸리티 + 헬퍼 (파서, 정규화, 권한 판정 등 순수 로직)
│   └── signals/       # 지출 신호 탐지 + 영향도 점수 (thresholds.ts 에 임계값 집중)
├── services/          # 외부 API 래퍼 (OpenAI, Polar, Supabase)
└── inngest/           # 백그라운드 job 함수 정의
supabase/
└── migrations/        # DB 스키마 + RLS + 시드
```

## 패턴
- Server Components 기본. Client Component는 인터랙션이 필요한 곳(업로드 위젯, job 진행률 폴링, 카테고리 수정, 컬럼 수동 매핑 화면)에만 쓴다
- CSV 파싱·가맹점 정규화·날짜/금액 파싱·신호 탐지는 외부 의존이 없는 순수 함수로 `src/lib/` 에 두고 단위 테스트로 고정한다. 제품 정확도의 대부분이 이 계층에 있다
- 신호 임계값은 전부 `src/lib/signals/thresholds.ts` 상수 하나에 모은다. 실사용 데이터를 보면 반드시 조정하게 되는데 값이 쿼리 곳곳에 박혀 있으면 조정이 불가능해진다. 경계값(+49/+50/+51%)과 오탐 케이스를 고정 픽스처로 테스트한다
- 외부 API 호출은 `src/services/` 래퍼를 거친다. 테스트에서는 이 래퍼를 모킹한다
- **LLM 모델은 호출 지점마다 다르다.** 가맹점 분류는 `gpt-5.6-luna`(비용 지배적, 출력이 enum 10종이라 상위 모델의 이득이 적다), 컬럼 매핑 추론과 리포트·신호 서술은 `gpt-5.6-terra`(호출이 드물고 틀렸을 때 비용이 크다). 모델명은 `src/services/openai.ts` 상수에만 두고 세 호출을 한 모델로 통일하지 않는다 (ADR-008)
- 오래 걸리는 작업은 전부 Inngest 함수로 보내고, HTTP 요청은 job을 만들고 즉시 반환한다
- **금액은 지출을 양수로 저장한다.** `transactions.amount` 는 항상 지출 금액(양수)이고, 입금·환불·취소는 `transaction_type` 으로 구분해 지출 집계에서 제외한다. 부호를 CSV 원본대로 두면 카드사(지출 양수)와 은행(출금 음수)의 규약이 한 테이블에 섞여 집계 시점마다 부호를 다시 판단해야 한다
- **날짜 계산은 `Asia/Seoul` 로 고정한다.** "이번 달"을 서버 시각(UTC)으로 계산하면 한국 시간 자정~오전 9시에 지난달 대시보드가 보인다
- 사용자가 넣은 문자열(가맹점명)이 LLM 프롬프트에 들어가는 지점은 전부 경계로 취급한다. 길이 상한·제어문자 제거를 거치고, 출력은 스키마로 강제해 검증한다

## 데이터 흐름

### 업로드 → 분석
```
클라이언트 → POST /api/uploads          (서명 URL 발급 + upload_jobs row 생성)
                                        파일명은 서버가 UUID로 생성. 크기·MIME 제한도 여기서 건다
Supabase Storage bucket                 private + allowedMimeTypes + fileSizeLimit
클라이언트 → Supabase Storage           (원본 CSV 직접 업로드, 서버를 거치지 않음)
클라이언트 → POST /api/uploads/:id/start (Storage 객체 존재 확인 후 csv.uploaded 발행)

Inngest 워커 (스텝별 독립 재시도):
  1. 인코딩 감지(EUC-KR/CP949 → UTF-8) → 헤더 + 샘플 5행 추출
  2. csv_format_fingerprints 조회 → 없으면 OpenAI로 컬럼 매핑 추론
     (date_column, date_format, merchant_column,
      amount_column | {deposit_column, withdrawal_column}, amount_sign)
  3. 매핑을 실제 20행에 적용 → 파싱 성공률 90% 미만이면 status=needs_mapping 후 중단
     날짜가 숫자 구분 형식이면 전체 행을 스캔해 MM/DD·DD/MM 을 판별한다
  4. 전체 행 스트리밍 파싱 → transactions insert (dedupe_key 충돌 시 무시)
     파싱 실패 행은 건너뛰고 skipped_rows 에 집계
     읽은 행이 0건이고 전체 행이 1건 이상이면 status=failed 후 중단
  5. 가맹점명 정규화 → 개인 오버라이드 → 전역 캐시 → 시드 룰 순으로 매칭
  6. 미매칭 고유 가맹점을 100개씩 나눈 뒤 **배치 1개당 스텝 1개**로 OpenAI 분류
     → 캐시 저장 → 거래 반영
  7. CSV에 포함된 모든 달에 대해 신호 탐지(5종) → 원화 영향도로 정렬
     → 상위 신호를 OpenAI 배치 1회로 문장 생성 → spending_signals 저장
  8. 영향받은 달의 monthly_reports.is_stale 세움 → status=completed

대시보드 → GET /api/uploads/:id (2초 폴링) → 진행률 표시
           완료·실패 시 폴링을 멈춘다
```

**스텝 하나가 Vercel 함수 호출 하나다.** Inngest가 주는 것은 스텝별 재시도와 상태 추적이지 실행시간 연장이 아니므로, 오래 걸리는 일은 스텝을 쪼개서 각 호출이 타임아웃 안에 들어오게 한다. step 6에서 배치를 루프로 돌면 가맹점 수에 비례해 한 호출이 길어져 결국 죽는다. 배치 수만큼 스텝을 돌리면 각 호출은 OpenAI 1회분으로 고정되고, 배치 하나가 실패해도 그것만 재시도된다.

CSV 파싱과 인코딩 변환은 Node API에 의존하므로 워커 라우트는 Node 런타임으로 고정한다(Edge 런타임 불가). Vercel 배포에서는 `/api/inngest` route에 필요한 `maxDuration` 을 명시하고, Inngest 서버가 endpoint에 접근할 수 있도록 Deployment Protection 설정을 확인한다.

배치가 3회 재시도 후에도 실패하면 해당 가맹점만 `기타`로 두고 job 자체는 성공 처리한다. 일부 분류 실패로 업로드 전체를 버리지 않는다. 단 이렇게 대체된 건은 신호 탐지에서 제외한다 — 실패가 몰린 달에 `기타` 카테고리가 급증한 것처럼 보이기 때문이다.

`needs_mapping` 상태면 대시보드가 CSV 미리보기와 컬럼 선택 UI를 띄우고, 사용자가 매핑을 확정하면 `csv.mapping_confirmed` 이벤트로 워커가 step 3부터 재개한다. 확정된 매핑은 `csv_format_fingerprints` 에 **그 사용자 범위로만** 저장해 다음 달 같은 카드사 CSV에서 LLM을 생략한다. 전역 공유는 하지 않는다 — 한 사람의 잘못된 매핑이 같은 카드사 CSV를 올리는 모든 사용자에게 퍼지는 것을 막는 가장 단순한 방법이고, 주 사용 패턴("같은 사람이 매달 같은 형식을 올린다")은 개인 캐시만으로 커버된다. 수동 매핑도 검증에 실패하면 다시 물어보되 시도 횟수에 상한을 둔다.

`/api/uploads/:id` 계열(조회·시작·삭제)은 전부 job 소유자를 확인한 뒤 처리한다. 워커는 service role로 돌아 RLS를 우회하므로, 소유권 확인이 라우트 계층의 유일한 방어선이다.

Inngest 스텝의 반환값은 Inngest 인프라에 저장된다. 스텝은 개수·id 목록 같은 최소 메타만 반환하고 거래 데이터 자체를 반환하지 않는다 — 개인 금융 데이터가 외부 서비스에 남지 않게 한다.

### AI 리뷰 (신호 탐지 → 서술)
```
SQL 신호 탐지 5종 → 원화 영향도 점수로 정렬 → 상위 신호만 OpenAI 배치 1회 → spending_signals
```

| 신호 | 조건 | 필요 데이터 | 영향도 |
|------|------|:---:|------|
| `category_spike` | 전월 대비 +50% **AND** 증가액 30,000원↑ | 2개월 | 증가액 |
| `new_merchant_large` | 처음 보는 가맹점 **AND** 그 카테고리 중앙값의 3배↑ | 2개월 | 거래 금액 |
| `outlier_transaction` | 단일 거래가 그 카테고리 월 지출의 30%↑ | 1개월 | 거래 금액 |
| `recurring_payment` | 같은 정규화 가맹점 · 금액 편차 10% 이내 · 간격 25~35일 · 3회↑ · **모든 달에서 월 1건** | 3개월 | 없음 (카드 제외) |
| `recurring_price_up` | 위 조건 + 최근 금액 10%↑ 인상 | 3개월 | **인상분 × 12** |

MVP는 5종이다. `long_running_recurring`(12개월 지속)은 그만큼의 데이터를 올리는 사용자가 초기에 없어 사실상 뜨지 않고, `category_record`(관측 이래 최대)는 `category_spike` 와 겹치는 경우가 대부분이라 뺐다. 둘 다 나중에 데이터가 쌓인 뒤 추가하면 된다.

조건이 항상 두 개인 이유: 비율만 쓰면 2,000원 → 8,000원이 `+300%`로 걸리고, 절대액만 쓰면 30만원 식비의 3만원 변동이 걸린다. AND로 묶어야 "평소와 다르고, 그리고 신경 쓸 만한 금액"이 된다. `recurring_payment` 의 "모든 달에서 월 1건"이 빠지면 카페 방문(5,000/5,200/4,800원, 간격 28·33일)이 구독으로 잡힌다.

`recurring_price_up` 의 영향도에 12를 곱하는 것이 핵심이다. 월 2,500원 인상은 연 30,000원이고 한 번 고치면 계속 절약되므로, 일회성 15만원 지출보다 위로 올라와야 한다.

**`recurring_payment` 은 영향도를 갖지 않고 인사이트 카드·코칭 문단에 올라오지 않는다.** "구독을 쓰고 있다"는 것은 평소와 다른 소비가 아니라 평소 그 자체다. 영향도를 억지로 매기면(예: 월 금액 × 12) 넷플릭스가 매달 카드 1위를 차지해, 이 기능을 죽이는 가장 흔한 방식인 알림 피로를 우리가 직접 만들게 된다. 변화인 `recurring_price_up`(인상)만 카드에 올린다. 따라서 `spending_signals.impact` 는 **nullable** 이고, 카드·코칭 문단 선정 쿼리는 `impact IS NOT NULL` 을 조건에 넣는다. `recurring_payment` 는 `narrative` 도 생성하지 않는다(LLM 배치에 포함하지 않는다) — 반복 지출 목록에서 SQL로만 렌더된다.

**신호의 `period` 는 그 신호를 뒷받침하는 관측 구간의 마지막 달이다.** 1개월·2개월 신호는 자명하게 해당 달이고, `recurring_*` 처럼 3개월을 보는 신호는 관측된 마지막 달을 쓴다. `recurring_price_up` 은 인상이 관측된 달이다. 이 규칙이 없으면 반복 지출 신호를 어느 달에 귀속시킬지가 구현마다 갈리는데, 최초 발견 달에 고정하면 신호가 과거에 묶여 "지속 개월"이 갱신되지 않고, 매달 새로 쌓이는 것은 정상 동작이다. 반복 지출 목록은 `(user_id, type, 대상 키)` 별로 **가장 최근 `period` row 하나만** 읽는다.

신호는 세 표면에 나타난다.

| 표면 | 내용 | LLM 호출 |
|------|------|:---:|
| 업로드 직후 인사이트 카드 | 가장 최근 달의 신호 중 `impact` 가 있는 것 상위 3개 | 업로드당 1회 (배치) |
| 월간 리포트 코칭 문단 | 그 달 신호 중 `impact` 가 있는 것 전체 + "무엇을 줄일 수 있나" | 리포트당 1회 (기존 호출에 통합) |
| 반복 지출 목록 `/dashboard/subscriptions` | `recurring_*` 을 표로 | **0회** (순수 SQL) |

거래별 코멘트(신호가 걸린 거래에 한 줄)는 MVP에서 뺐다. 인사이트 카드와 내용이 겹치는데, 거래 목록에 붙이려면 조인 렌더링과 프롬프트 분기가 따로 필요하다.

5종 중 1개월 데이터로 작동하는 것은 `outlier_transaction` 하나뿐이다. 첫 달 사용자에게는 빈 카드 대신 "다음 달이면 지난달과 비교해 드릴 수 있습니다"로 기대치를 관리한다.

**비율 계산의 경계 처리.** 전월 지출이 0인 카테고리는 `category_spike` 의 분모가 0이 되므로 탐지 대상에서 제외한다. 그 달에 처음 생긴 카테고리는 "급증"이 아니라 다른 사건이고, `new_merchant_large` 가 이미 담당한다. 0원 거래(포인트 전액 결제)도 비율 계산에서 뺀다.

**누적과 숨김.** 같은 달을 다시 업로드해도 기존 신호를 지우지 않고 새로 발생한 것만 추가한다(`(user_id, type, period, 대상 키)` 유니크로 중복 방지). 지우고 다시 계산하면 신호가 항상 최신 거래를 반영하지만, 숨김 기록을 별도 테이블로 빼야 하고 동시 업로드에서 삭제와 삽입이 경합한다. 대신 한 달에 명세서를 여러 장 올린 경우 먼저 올린 파일만으로 계산된 신호가 조금 낮게 잡힌 채 남는다 — MVP에서 감수한다.

숨김은 `spending_signals.dismissed_at` 컬럼 하나로 처리한다.

### 월간 리포트
```
사용자가 월 선택 → SQL 집계(카테고리별 합계·건수, 전월 대비, 상위 가맹점, 최대 지출)
                → 그 달 spending_signals 조회해 함께 첨부
                → 집계 JSON만 OpenAI에 전달 → 서술 문단 + 코칭 문단 생성
                → monthly_reports 캐시 → UI는 수치를 집계값으로, 문단만 LLM 출력으로 렌더
```
해당 월 거래가 바뀌면 `is_stale` 을 세우고 재생성 버튼을 노출한다.

## 데이터 모델
| 테이블 | 용도 |
|--------|------|
| `profiles` | 체험·구독 상태 (`trial_started_at`, `subscription_status`, `polar_customer_id`, `current_period_end`) |
| `upload_jobs` | 업로드 job 상태와 진행률, 확정된 컬럼 매핑, 완료 요약 4종, 원본 파일명 |
| `transactions` | 파싱된 거래. `amount`(지출 양수), `transaction_type`, `dedupe_key` |
| `merchant_categories` | 전역 가맹점 → 카테고리 캐시. user_id 없음 |
| `user_category_overrides` | 사용자별 분류 수정. 매칭 시 최우선 |
| `monthly_reports` | 생성된 리포트 캐시 |
| `csv_format_fingerprints` | `(user_id, 헤더 조합 해시)` → 검증된 컬럼 매핑. **개인 범위** |
| `spending_signals` | 탐지된 지출 신호. `type`, `period`(year_month, 관측 구간의 마지막 달), `payload`(jsonb — 탐지에 쓰인 숫자 전체), `impact`(원화 영향도, 정렬 키, **nullable** — `recurring_payment` 은 NULL), `narrative`(nullable, LLM 문장), `upload_job_id`, `dismissed_at`. `(user_id, type, period, 대상 키)` 유니크 |

**`dedupe_key` 는 `(user_id, 날짜, 금액, 정규화 가맹점, 그 조합의 파일 내 N번째)` 로 만들고 `(user_id, dedupe_key)` 에 유니크를 건다.** 순번이 빠지면 같은 날 같은 가게에서 같은 금액을 두 번 결제한 정상 거래가 중복으로 지워진다 — 사용자에게는 아무 표시 없이 합계만 틀리게 보이는, 가장 나쁜 종류의 실패다. 대신 기간이 겹치는 두 파일(1~2월, 2~3월)을 올리면 겹친 달이 중복 삽입되는데, 이쪽은 완료 요약의 중복 건수로 드러난다.

가맹점 시드 룰은 테이블이 아니라 `src/lib/merchant-rules.ts` 상수로 둔다. 150개 남짓이라 코드로 충분하고, 순수 함수로 테스트할 수 있으며, 룰 수정이 배포로 끝난다.

사용자 데이터 테이블은 전부 RLS(`user_id = auth.uid()`). `merchant_categories` 만 읽기 전역·쓰기 service role 전용이고, `csv_format_fingerprints` 는 개인 범위라 다른 사용자 테이블과 같은 RLS를 적용한다. Storage 경로는 `{user_id}/{job_id}/{서버가 생성한 파일명}` 이고 다운로드는 60초 서명 URL로만, 소유자 확인 후에 내보낸다.

## 백그라운드 스케줄

Inngest cron 함수로 돌린다. 별도 스케줄러를 두지 않는다.

| 함수 | 주기 | 하는 일 |
|------|------|---------|
| `purge-expired-originals` | 매일 | 해지 후 30일이 지난 사용자의 Storage 원본을 삭제한다. 거래 데이터는 남긴다. 삭제 실패 건은 다음 실행에서 다시 시도한다 |

체험 만료에는 크론을 쓰지 않는다. `subscription_status` 는 결제 사실만 담고, 만료 여부는 `entitlement.ts` 가 `trial_started_at` 과 `current_period_end` 로 매 요청 계산한다. 크론으로 상태를 내리면 실행 지연만큼 무료 이용 구간이 생기고, 크론이 죽으면 전원이 무제한이 된다. 반면 파일 삭제는 계산으로 대신할 수 없어 실행 주체가 필요하다.

## 상태 관리
- 서버 상태는 Server Components에서 직접 조회한다. 전역 상태 라이브러리를 두지 않는다
- job 진행률처럼 갱신이 필요한 값만 Client Component에서 폴링하고 `useState` 로 관리한다. 폴링은 `completed`·`failed` 에서 멈춘다
- 구독·체험 권한은 클라이언트 상태로 들고 있지 않는다. 매 요청마다 서버에서 판정한다
- LLM이 만든 문장(`narrative`)과 가맹점명은 React의 기본 이스케이프로 렌더한다. `dangerouslySetInnerHTML` 을 쓰지 않는다
- 같은 달 리포트 생성을 두 번 누르면 LLM이 두 번 호출된다. 생성 중 상태를 서버에서 확인해 중복 요청을 막는다
