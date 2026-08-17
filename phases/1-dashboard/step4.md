# Step 4: uploads-history

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/USER_FLOW.md` — **S34(날짜 형식이 모호한 CSV) 와 "조용히 틀리는 것을 보이게 만든다" 문단이 이 step 의 핵심이다.** S11 · S24 · S24b · 완료 요약 규칙 · 상태 머신 1
- `/docs/ARCHITECTURE.md` — "업로드 파이프라인" 7단계(날짜가 숫자 구분 형식이면 전체 행을 스캔해 MM/DD·DD/MM 판별) · "데이터 모델"
- `/docs/ADR.md` — ADR-001(완료된 job 의 매핑을 고치는 경로는 MVP 에 없다) · ADR-009(원본 보관과 개별 삭제)
- `/docs/DESIGN.md` — "danger — 빨강이 두 의미를 갖는 문제"(파괴적 동작에만, 테두리 있는 버튼, 채움 없음)

이전 step 에서 만들어진 아래 파일을 **전부 읽고 시그니처를 확인한 뒤** 작업하라:

- `src/lib/csv/mapping.ts` — `applyMapping(header, rows, mapping) → MappingTrial`. **지금 `decideDateFormat(...).format` 을 내부에서 쓰고 버린다. 이 step 이 고친다**
- `src/lib/csv/date.ts` — `decideDateFormat(rawDates) → { format, ambiguousResolvedBy: "scan" | "assumed-iso" }` · `parseDate` · `toSeoulDateString`
- `src/inngest/process-upload.ts` — `applyMapping` 을 부르는 스텝(`validate-sample-mapping` · `parse-and-store-transactions`)과 `UploadPipelineRepository` 인터페이스
- `src/app/api/uploads/[id]/route.ts` — GET 응답과 DELETE(job row + Storage 객체 삭제)
- `src/components/UploadProgressCard.tsx` · `UploadSummary.tsx` (step 1) — 완료 요약 렌더 규칙을 재사용한다
- `src/components/Badge.tsx` · `Button.tsx`(`variant="danger"`)
- `supabase/migrations/20260817072000_init.sql` · `20260817082118_upload_pipeline_metadata.sql`

## 작업

### 1. 마이그레이션 — `upload_jobs` 컬럼 3개 추가

새 파일 `supabase/migrations/<타임스탬프>_upload_job_date_format.sql`:

```sql
alter table public.upload_jobs
  add column date_format text,
  add column date_format_resolved_by text,
  add column created_at timestamptz not null default now();
```

- `date_format` · `date_format_resolved_by` 는 S34 를 위한 것이다. **이 두 컬럼이 없으면 해석한 날짜 형식을 화면에 표시할 수 없다**
- `created_at` 은 업로드 이력을 최신순으로 정렬하기 위한 것이다. **현재 `upload_jobs` 에는 시간 컬럼이 하나도 없어 정렬 키가 없다.** `id` 는 uuid v4 라 시간순이 아니다
- 적용 후 `supabase gen types typescript --local` 결과를 `src/types/database.ts` 에 다시 저장한다

### 2. `applyMapping` 이 판별한 날짜 형식을 버리지 않게 고친다

`src/lib/csv/mapping.ts` 의 `MappingTrial` 을 확장한다:

```ts
export type MappingTrial = {
  parsed: ParsedRow[];
  failed: number;
  total: number;
  successRate: number;
  dateFormat: string;                              // decideDateFormat 의 format
  dateFormatResolvedBy: "scan" | "assumed-iso";    // decideDateFormat 의 ambiguousResolvedBy
};
```

- 컬럼을 찾지 못해 조기 반환하는 경로에서도 두 필드를 채워야 타입이 성립한다. 그 경우의 값은 `decideDateFormat([])` 의 결과를 쓴다
- **`src/lib/` 이므로 TDD Guard 대상이다.** `src/lib/csv/mapping.test.ts` 에 케이스를 **먼저** 추가하라 — `13/04/2026` 이 섞인 입력은 `DD/MM/YYYY` + `scan`, 전부 12 이하면 `MM/DD/YYYY` + `assumed-iso`
- **기존 테스트를 고치지 마라.** 필드를 더하는 변경이라 기존 단언은 그대로 통과해야 한다

### 3. 워커가 해석한 형식을 저장하게 한다

`src/inngest/process-upload.ts`:

- **전 행 파싱 스텝(`parse-and-store-transactions`)의 `applyMapping` 결과**를 `upload_jobs.date_format` · `date_format_resolved_by` 에 기록한다. 20행 샘플이 아니라 **전체 행 스캔 결과가 정본이다** — MM/DD·DD/MM 판별은 전체를 봐야 갈린다 (ARCHITECTURE 7단계)
- `UploadPipelineRepository.updateJob` 의 patch 타입에 두 필드를 더한다
- **스텝의 반환값에 거래 데이터를 담지 마라.** 형식 문자열 두 개는 메타이므로 괜찮다 (ARCHITECTURE: 스텝 반환값은 Inngest 인프라에 저장된다)
- 파이프라인의 다른 동작을 바꾸지 마라. 이 step 은 이미 계산하고 있던 값을 저장할 뿐이다

### 4. `/dashboard/uploads` — 업로드 이력 화면

`created_at` 내림차순 표. 열 구성:

- **파일명**(`original_filename` — 클라이언트가 준 이름은 여기에만 있다) · **카드**(`card_label`) · **상태** · **완료 요약** · **해석한 날짜 형식** · **삭제**
- 상태별 표시는 상태 머신 1 표를 따른다. `needs_mapping` 이면 `/dashboard/uploads/[id]/mapping` 링크를 둔다(**화면은 step 5 가 만든다. 여기서는 링크까지다**). `failed` 면 `failed_reason` 을 사람 말 그대로
- 완료 요약은 step 1 의 규칙을 그대로 쓴다 — 0인 항목은 숨기되 **"새로 추가된 거래 0건" 은 반드시 표시**. `card_label_mismatch_warning` 이 있으면 문장으로 함께 (S24b)
- **해석한 날짜 형식** (S34) — `date_format` 을 그대로 보여주고, `date_format_resolved_by` 에 따라 보조 문구를 붙인다:
  - `scan` → "전체 행을 확인해 판별했습니다"
  - `assumed-iso` → "구분되지 않아 이 형식으로 가정했습니다"
  - 그리고 **틀렸을 때의 복구 경로를 그 자리에 적는다**: "형식이 틀렸다면 이 업로드를 삭제하고 다시 올려주세요." 이유: 완료된 job 의 매핑을 고치는 경로는 MVP 에 없다 (ADR-001). 이 안내가 없으면 조용히 틀린 데이터를 사용자가 고칠 방법을 모른다
  - 날짜 형식은 `--font-mono` 로 렌더한다 (DESIGN "타이포그래피")
- **삭제** — `Button variant="danger"`(테두리만, 채움 없음). 기존 `DELETE /api/uploads/[id]` 를 호출한다
  - **삭제 전에 cascade 범위를 문장으로 알린다**: 그 업로드로 들어온 **거래와 신호가 함께 사라진다**(`transactions` · `spending_signals` 가 `upload_job_id` 에 `on delete cascade`). 몇 건인지 숫자로 보여주고 재확인을 받아라. 숫자 없이 "정말 삭제할까요?"만 묻지 마라
  - 원본 Storage 객체도 함께 지워진다(라우트가 이미 한다). **사용자가 개별 파일을 삭제할 수 있어야 하는 것은 ADR-009 의 요구다**
- `expired` 사용자도 이 화면을 읽을 수 있다. 삭제는 쓰기이므로 막는다 — 버튼을 비활성으로 두고 이유를 밝혀라

## Acceptance Criteria

```bash
supabase db reset   # 마이그레이션 적용 성공 (로컬)
npm run build       # 컴파일 에러 없음
npm run lint        # 경고 0
npm test            # mapping.test.ts 의 날짜 형식 케이스 포함 전부 통과
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `applyMapping` 이 판별한 날짜 형식을 반환값에 담는가? 그 테스트를 구현보다 먼저 썼는가?
   - 워커가 **전 행 파싱** 결과의 형식을 저장하는가? (20행 샘플이 아니라)
   - 이력에 해석한 날짜 형식과 **복구 경로 안내**가 함께 있는가?
   - 삭제 확인이 cascade 로 사라질 거래·신호 건수를 숫자로 알리는가?
   - 완료된 job 의 매핑을 고치는 UI 를 만들지 않았는가?
   - 파이프라인의 다른 동작(상태 전이·fingerprint 저장 조건)을 바꾸지 않았는가?
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? ADR 기술 스택을 벗어나지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/1-dashboard/index.json` 의 step 4 를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step 이 알아야 할 것: `MappingTrial` 의 새 필드명, `upload_jobs` 의 새 컬럼명, 이력 화면 경로와 매핑 화면으로 가는 링크 위치)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **완료된 job 의 컬럼 매핑을 고치는 화면을 만들지 마라.** 이유: MVP 에 그 경로는 없다. 복구는 삭제 후 재업로드다 (ADR-001 · S34).
- **원본 CSV 자동 삭제 크론을 만들지 마라.** 이유: 원본은 계정 삭제 시까지 보관하고 cron 은 두지 않는다 (ADR-009). 개별 삭제는 사용자가 이 화면에서 한다.
- **`applyMapping` 의 기존 판정 로직(성공률·실패 카운트)을 바꾸지 마라.** 이유: 파이프라인의 `needs_mapping` 판정이 그 값에 걸려 있고 테스트가 고정돼 있다. 이 step 은 이미 계산된 값을 반환에 더할 뿐이다.
- **20행 샘플의 날짜 형식을 저장하지 마라.** 이유: MM/DD 와 DD/MM 은 전체 행을 봐야 갈린다. 샘플 결과를 저장하면 화면이 틀린 형식을 보여준다.
- **삭제를 "되돌릴 수 있다"고 암시하지 마라.** 이유: 거래·신호·원본 파일이 함께 사라지고 복구 경로가 없다.
- **컬럼 매핑 미리보기·드롭다운 화면을 만들지 마라.** 이유: step 5 의 몫이다.
- 기존 테스트를 깨뜨리지 마라.
- 커밋하지 마라. execute.py 가 처리한다.
