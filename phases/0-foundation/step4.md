# Step 4: csv-parse

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — **"업로드 파이프라인" 5~8단계, "두 종류의 실패", "sanity check", "중복 방지 — dedupe_key" 가 이 step 의 단일 출처다.** "패턴" 절의 `Asia/Seoul` 규칙도 읽어라
- `/docs/ADR.md` — ADR-001(매핑 실패는 묻고 데이터 이상은 거절) · ADR-003(dedupe_key)
- `/docs/USER_FLOW.md` — S9 · S10 · S12 · S12b · S12c · S12d · S15 · S17 · S24 · S34, "상태 머신 1"
- `/AGENTS.md`

이전 step 에서 만들어진 파일:

- `src/types/database.ts` — `transactions` · `upload_jobs` 의 실제 컬럼과 enum 값
- `src/lib/categories.ts`
- `supabase/migrations/*.sql` — `transaction_type` 3종의 정확한 값

## 작업

`src/lib/csv/` 에 **외부 의존이 없는 순수 함수**로 파싱 계층을 만든다. 제품 정확도의 대부분이 이 계층에 있으므로 픽스처로 촘촘히 고정한다.

**모든 파일이 TDD Guard 검사 대상이다. 각 모듈의 테스트 파일을 먼저 만들어라.**

### 1. 인코딩 — `src/lib/csv/encoding.ts`

```ts
export type DetectedEncoding = 'utf-8' | 'euc-kr' | 'cp949'
export function detectEncoding(bytes: Uint8Array): DetectedEncoding
export function decodeCsv(bytes: Uint8Array): { text: string; encoding: DetectedEncoding }
```

- UTF-8 BOM · UTF-8 유효성 검사를 먼저 보고, 실패하면 CP949 계열로 디코딩한다
- 디코딩 라이브러리는 `iconv-lite` 를 쓴다. 사용자에게 인코딩을 묻지 않는다 (S17 — 조용히 처리)

### 2. 파싱과 헤더 — `src/lib/csv/parse.ts`

```ts
export function parseCsv(text: string): { header: string[]; rows: string[][] }
export function hashHeader(header: string[]): string     // sha256, 정규화 후
```

- `hashHeader` 는 **결정론적**이어야 한다. 같은 카드사 CSV 는 항상 같은 해시가 나와야 한다(공백·BOM·대소문자 정규화). 이 값이 `csv_format_fingerprints` 의 키이자 카드 오지정 판정 근거다
- 데이터 행이 0건인 파일(헤더만 있는 CSV)을 구분할 수 있어야 한다 (USER_FLOW — "거래가 없는 파일입니다")

### 3. 컬럼 매핑 적용 — `src/lib/csv/mapping.ts`

```ts
export type ColumnMapping = { date: string; amount: string; merchant: string; type?: string }
export type MappingTrial = { parsed: ParsedRow[]; failed: number; total: number; successRate: number }
export function applyMapping(header: string[], rows: string[][], mapping: ColumnMapping): MappingTrial
```

- **매핑 추론(LLM)은 이 step 의 범위가 아니다.** 여기는 주어진 매핑을 적용하고 성공률을 재는 곳이다. 추론은 step 5 가 만든다

### 4. 날짜 — `src/lib/csv/date.ts`

```ts
export type DateFormatDecision = { format: string; ambiguousResolvedBy: 'scan' | 'assumed-iso' }
export function decideDateFormat(rawDates: string[]): DateFormatDecision
export function parseDate(raw: string, format: string): Date | null
```

- **`Asia/Seoul` 로 고정한다.** 서버 시각(UTC)으로 "이번 달"을 계산하면 한국 시간 자정~오전 9시에 지난달 데이터가 된다
- 숫자 구분 형식(`03/04/2026`)은 **전체 행을 스캔해** MM/DD 와 DD/MM 을 판별한다. 20행 샘플로 결정하지 마라 — 앞쪽에 13 이상인 값이 없으면 잘못 굳는다
- 끝까지 구분되지 않으면 `YYYY-MM-DD` 계열로 가정하고, 그 사실을 `ambiguousResolvedBy` 로 돌려준다. 업로드 이력이 이 값을 사람 말로 표시한다 (S34 — "조용히 틀리는 것을 보이게 만든다")

### 5. 금액과 거래 종류 — `src/lib/csv/amount.ts`

```ts
export function parseAmount(raw: string): number | null              // 항상 양수. 파싱 불가면 null
export function decideTransactionType(row: RawRow): TransactionType | null
```

- **`amount` 는 항상 양수다.** 부호는 `transaction_type` 이 담당한다
- `transaction_type` 은 `expense` · `refund` · `deposit` **3종뿐**이다. 한국 카드사 CSV 의 표현(승인 · 취소 · 환불 · 입금 등)을 여기에 매핑한다
- **매핑되지 않는 행은 `expense` 로 두지 말고 건너뛴다** (ARCHITECTURE "데이터 모델"). 모르는 것을 지출로 넣으면 합계가 조용히 틀린다

### 6. sanity check — `src/lib/csv/sanity.ts`

```ts
export type SanityResult = { ok: true } | { ok: false; reason: string }
export function runSanityCheck(rows: ParsedRow[]): SanityResult
```

ARCHITECTURE "sanity check" 표 그대로:

| 검사 | 임계 |
|---|---|
| 거래일이 미래이거나 10년 이전 | 5% 초과 |
| 금액이 0이거나 파싱 불가 | 30% 초과 |
| 유효 거래 수 | 0건 |

- `reason` 은 **사용자에게 그대로 보여줄 한국어 문장**이다 (S12c — "거래일을 읽을 수 없는 행이 절반을 넘습니다"). 기술 로그가 아니다
- 이 검사에 걸리면 `failed` 이고 fingerprint 를 저장하지 않는다. **그 판단은 step 7 이 하고, 여기는 판정 결과만 돌려준다**

### 7. dedupe_key — `src/lib/csv/dedupe.ts`

```ts
export function assignOccurrences(rows: ParsedRow[]): (ParsedRow & { occurrence: number })[]
export function buildDedupeKey(input: {
  userId: string; cardLabel: string; transactedOn: string;
  amount: number; merchantNormalized: string; occurrence: number
}): string
```

- 키는 `sha256(user_id | card_label | transacted_on | amount | merchant_normalized | occurrence)` 다
- **`occurrence` 는 "같은 파일 안에서 (날짜, 금액, 정규화 가맹점명) 조합이 몇 번째로 등장했는지"(0부터)다.** 파일 내 행 순번을 쓰지 마라 — 3월치 파일과 3~4월치 파일에서 같은 거래의 순번이 달라져 중복 삽입된다 (ADR-003)
- **`card_label` 을 키에서 빼지 마라.** `occurrence` 는 파일 안에서만 세므로, 카드 A와 카드 B의 명세서에 같은 조합이 1건씩 있으면 양쪽 다 `occurrence = 0` 이 되어 키가 같아진다. 그러면 진짜 2건이 1건으로 줄어드는데 화면에는 "중복 제거"로 보고된다 (ADR-003)
- **`merchantNormalized` 는 인자로 받는다.** 정규화 함수 자체는 step 5 가 만든다. 이 모듈에서 정규화를 구현하지 마라

### 8. 임계값 상수

이 계층의 임계값(20행 샘플 성공률 90% · 전 행 실패율 20% · sanity 3종 · 샘플 크기 20)은 `src/lib/csv/` 안의 상수 파일 하나에 모은다.

**`src/lib/signals/thresholds.ts` 에 넣지 마라.** 그 파일은 신호 5종의 임계값 전용이고 (ADR-004), 성격이 다른 값을 섞으면 "실사용 분포를 보고 조정할 대상"이 흐려진다.

### 9. 테스트 — 이 step 의 본체

`src/lib/csv/__fixtures__/` 에 실제 형태의 CSV 픽스처를 두고 고정한다. 최소한 아래를 덮어라:

- 인코딩 3종(UTF-8 BOM · EUC-KR · CP949) 이 같은 결과로 디코딩된다
- **경계값**: 20행 샘플 성공률 89% / 90% / 91%, 전 행 실패율 19% / 20% / 21%, 미래 거래일 4% / 5% / 6%, 금액 이상 29% / 30% / 31%, 유효 거래 0건
- 날짜: `2026-03-04` · `03/04/2026`(MM/DD 로 확정되는 파일) · `03/04/2026`(DD/MM 로 확정되는 파일) · 끝까지 모호한 파일
- `transaction_type`: 승인 · 취소 · 환불 · 입금 · **모르는 값(건너뛴다)**
- `occurrence`: 같은 파일에 같은 (날짜, 금액, 가맹점) 2건 → 0과 1을 받는다
- `dedupe_key`: `card_label` 만 다른 두 입력이 **다른 키**를 만든다
- 헤더만 있고 데이터 행이 0건인 파일

## Acceptance Criteria

```bash
npm run build   # 컴파일 에러 없음
npm run lint    # 경고 0
npm test        # csv 테스트 포함 전부 통과
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `src/lib/csv/` 의 어떤 파일도 DB · OpenAI · Supabase 를 import 하지 않는가?
   - 날짜 계산이 `Asia/Seoul` 로 고정되어 있는가?
   - `amount` 가 항상 양수인가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-foundation/index.json` 의 step 4 를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step 이 알아야 할 것: 모듈별 export 이름, `ParsedRow` 타입 형태, 임계값 상수 파일 경로)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **DB · Supabase · OpenAI 를 import 하지 마라.** 이유: 이 계층은 외부 의존이 없는 순수 함수여야 단위 테스트로 고정된다 (ARCHITECTURE "패턴"). 저장과 상태 전이는 step 7 이 한다.
- **컬럼 매핑을 LLM 으로 추론하지 마라.** 이유: 추론은 step 5 의 `src/services/openai.ts` 가 담당한다. 여기는 주어진 매핑을 적용하고 성공률을 재는 곳이다.
- **가맹점명 정규화 함수를 만들지 마라.** 이유: step 5 의 `src/lib/merchant.ts` 가 단일 출처다. 두 곳에 있으면 캐시 적중률이 조용히 갈린다.
- **스트리밍 파서를 쓰지 마라.** 이유: `occurrence` 를 세려면 파일 전체를 봐야 하고 sanity check 의 비율 판정도 마찬가지다. 전 행을 메모리에 올리는 것이 결정이다 (ADR-003).
- **읽지 못한 행을 `expense` 로 채우거나 기본값으로 메우지 마라.** 이유: 조용히 틀린 합계가 이 제품이 가장 피하려는 실패다.
- 기존 테스트를 깨뜨리지 마라.
- 커밋하지 마라. execute.py 가 처리한다.
