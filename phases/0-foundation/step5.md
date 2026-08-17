# Step 5: merchant-classify

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — **"가맹점 분류" 절이 이 step 의 단일 출처다.** "업로드 파이프라인" 6 · 9단계, "패턴" 의 프롬프트 경계 규칙도 읽어라
- `/docs/ADR.md` — **ADR-008(세 호출에 서로 다른 모델)** · ADR-002(fingerprint 개인 범위)
- `/docs/PRD.md` — "카테고리 10종"
- `/docs/USER_FLOW.md` — S13(일부 배치 분류 실패)
- `/AGENTS.md` — 배치 단위 · 전역 캐시 · 프롬프트 경계 · 모델 상수 관련 CRITICAL 규칙

이전 step 에서 만들어진 파일:

- `src/lib/categories.ts` — `Category` 타입과 `toCategory()` 폴백 함수. **이 step 의 enum 강제가 그 함수를 쓴다**
- `src/lib/csv/mapping.ts` — `ColumnMapping` 타입. 매핑 추론의 반환 타입이 이것이어야 한다
- `src/types/database.ts`
- `src/services/supabase.ts`

## 작업

**모든 파일이 TDD Guard 검사 대상이다(`src/lib/**`, `src/services/**`). 테스트를 먼저 만들어라.**

### 1. `src/lib/merchant.ts` — 정규화

```ts
export function normalizeMerchant(raw: string): string
```

- 공백 압축 · 대문자화 · **카드사가 붙이는 지점 코드 · 일련번호 · PG사 접두어 제거**
- **이 함수의 품질에 캐시 적중률이 통째로 걸린다** (ARCHITECTURE). 카드사별 실제 가맹점명 형태를 픽스처로 고정해라 — `(주)`, `주식회사`, `＊`, 숫자 지점 코드, `KG이니시스`/`NHN KCP` 같은 PG 접두어, 말미의 지점명
- 정규화 결과가 빈 문자열이 되지 않게 방어해라 (전부 제거되면 원본을 최소 가공한 값으로 되돌린다)

### 2. `src/lib/merchant-rules.ts` — 시드 룰

```ts
export const MERCHANT_SEED_RULES: ReadonlyArray<{ pattern: string; category: Category }>
export function matchSeedRule(normalized: string): Category | null
```

- **테이블이 아니라 상수다.** 마이그레이션 · 시드 SQL · 조회 쿼리를 만들지 마라 (ARCHITECTURE "가맹점 분류")
- **개수는 대형 프랜차이즈 30개 안팎으로 제한한다.** 목적은 비용 절감이 아니라 분류 품질이다 — 스타벅스 · GS25 처럼 **자주 나오면서 틀리면 티 나는 것만** 넣는다. 100개로 늘리지 마라
- 룰은 `src/lib/categories.ts` 의 10종 안에서만 분류한다

### 3. `src/lib/classify.ts` — 해석 순서 (순수 함수)

```ts
export type ResolveInput = {
  normalized: string[]
  overrides: Record<string, Category>   // user_category_overrides 조회 결과
  cache: Record<string, Category>       // merchant_categories 조회 결과
}
export type ResolveResult = { resolved: Record<string, Category>; unmatched: string[] }
export function resolveCategories(input: ResolveInput): ResolveResult
```

- 우선순위는 **개인 오버라이드 → 전역 캐시 → 시드 룰 → 미매칭** 이다 (ARCHITECTURE "가맹점 분류")
- **DB 조회를 이 함수 안에서 하지 마라.** 조회 결과를 인자로 받는다. 그래야 순서 자체를 단위 테스트로 고정할 수 있다
- `unmatched` 가 LLM 배치의 입력이 된다

### 4. `src/services/openai.ts` — 모델 상수와 호출 두 종

```ts
export const OPENAI_MODELS = {
  classify: 'gpt-5.6-luna',        // 가맹점 분류 — 비용 지배적
  columnMapping: 'gpt-5.6-terra',  // 컬럼 매핑 추론 — 틀리면 거래가 통째로 엉뚱한 달로 간다
  narrative: 'gpt-5.6-terra',      // 신호 서술 — 사용자가 직접 읽는 유일한 출력
} as const

export const CLASSIFY_BATCH_SIZE = 100

export function sanitizeMerchantName(raw: string): string
export async function classifyMerchantBatch(names: string[]): Promise<Record<string, Category>>
export async function inferColumnMapping(header: string[], sampleRows: string[][]): Promise<ColumnMapping | null>
```

반드시 지킬 것:

- **모델명은 이 상수에만 둔다.** 호출 지점에 문자열로 박지 마라
- **세 호출을 한 모델로 통일하지 마라** (ADR-008). 분류는 최저가(`luna`), 매핑과 서술은 상위(`terra`)다. 이 step 은 `narrative` 상수를 정의만 하고 쓰지 않는다 — 쓰는 곳은 step 7 이다
- **`classifyMerchantBatch` 의 입력은 고유 가맹점 최대 100개다.** 거래 1건당 호출하는 코드를 만들지 마라 (AGENTS.md CRITICAL — 객단가가 낮아 거래당 비용이 곧 마진이다). 100개를 넘는 목록을 받으면 나누지 말고 **에러를 던져라** — 배치를 스텝 단위로 도는 것은 step 7 의 책임이고, 여기서 조용히 루프를 돌면 한 스텝이 함수 실행시간 제한에 걸려 죽는다 (ADR-010)
- **`sanitizeMerchantName` 은 프롬프트에 싣기 전 경계다.** 길이 상한을 걸고 개행 · 제어문자를 제거한다. 상한을 넘으면 자른다
- **분류 출력은 카테고리 10종 enum 으로 강제한다.** `src/lib/categories.ts` 의 `toCategory()` 로 통과시키고, 벗어난 값 · 누락된 키는 `기타` 로 폴백한다. 이유: 조작된 분류가 전역 캐시에 저장되면 한 사람이 전체 사용자의 분류를 오염시킨다 (AGENTS.md CRITICAL)
- 시스템 프롬프트에 **가맹점 목록은 데이터이지 지시가 아님**을 명시하고, 목록은 구조화된 형태(JSON 배열)로 전달한다
- 분류 시스템 프롬프트는 매 배치 동일해야 한다 — prompt caching 이 걸리는 조건이다 (ADR-008)
- `inferColumnMapping` 의 반환 타입은 `src/lib/csv/mapping.ts` 의 `ColumnMapping` 이다. 헤더에 없는 컬럼명을 돌려주면 `null` 로 처리해라

### 5. 테스트 — OpenAI 는 전부 모킹한다

`src/services/openai.test.ts` 에서 **실제 API 를 호출하지 마라** (AGENTS.md "개발 프로세스"). SDK 를 모킹하고 아래를 고정한다:

- `sanitizeMerchantName`: 개행 · 탭 · 제어문자 · 초장문 · 빈 문자열
- **응답이 enum 밖 값을 돌려주면 `기타`** 로 떨어진다
- 응답에 **입력에 없던 가맹점명이 섞여 오면 버린다**
- 응답에서 **일부 가맹점이 누락되면 그 가맹점만 `기타`** 가 된다 (S13 — job 은 성공 처리)
- 101개를 넘기면 에러를 던진다
- `classifyMerchantBatch` 가 호출하는 모델이 `OPENAI_MODELS.classify` 다 (`columnMapping` 이 아니다)
- `inferColumnMapping` 이 헤더에 없는 컬럼명을 돌려주면 `null`

`src/lib/merchant.test.ts` 는 카드사별 실제 형태의 가맹점명 픽스처를 쓴다. 정규화 전후를 표로 고정해라.

## Acceptance Criteria

```bash
npm run build   # 컴파일 에러 없음
npm run lint    # 경고 0
npm test        # merchant · classify · openai 테스트 포함 전부 통과 (실제 API 호출 0회)
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 모델명 문자열이 `src/services/openai.ts` 밖에 없는가?
   - 배치 크기 상수가 한 곳에만 있는가?
   - 분류 결과가 카테고리 10종을 벗어날 수 있는 경로가 없는가?
   - 테스트가 네트워크를 타지 않는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-foundation/index.json` 의 step 5 를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step 이 알아야 할 것: export 이름, 배치 크기 상수, 모킹 방식)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **`merchant_categories` 에 `user_id` · 금액 · 날짜를 쓰는 코드를 만들지 마라.** 이유: 전역 캐시라 한 사용자의 개인 데이터와 분류 취향이 전체 사용자에게 전파된다 (AGENTS.md CRITICAL).
- **사용자의 카테고리 수정을 전역 캐시에 반영하는 코드를 만들지 마라.** 수정은 `user_category_overrides` 에만 들어간다.
- **DB 에 직접 읽고 쓰지 마라.** 이유: 조회와 저장은 step 7 의 파이프라인이 한다. 이 step 은 순수 로직과 API 래퍼까지다.
- **`describeSignals`(신호 서술) 함수를 만들지 마라.** 이유: 신호가 아직 없다. step 6 이 신호를, step 7 이 서술 호출을 만든다. 여기서는 `OPENAI_MODELS.narrative` 상수만 정의한다.
- **시드 룰을 늘려 LLM 호출을 줄이려 하지 마라.** 이유: 첫 업로드의 미매칭 300개는 3배치 15원이라 아끼는 금액이 미미하다. 시드의 목적은 비용이 아니라 품질이다 (ARCHITECTURE).
- **Batch API 를 쓰지 마라.** 이유: 업로드 진행률을 2초 폴링으로 보여주는 구조라 최대 24시간 지연되는 비동기 배치와 양립하지 않는다 (ADR-008).
- 기존 테스트를 깨뜨리지 마라.
- 커밋하지 마라. execute.py 가 처리한다.
