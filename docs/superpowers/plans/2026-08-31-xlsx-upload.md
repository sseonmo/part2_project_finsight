# xlsx 명세서 업로드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카드사에서 받은 `.xlsx` 이용대금명세서를 그대로 업로드하면, 브라우저가 CSV 로 변환해 올려 기존 파이프라인이 처리하게 한다.

**Architecture:** 변환은 전부 브라우저에서 끝난다. `UploadDialog` 가 `.xlsx` 를 만나면 `readSheet`(read-excel-file 지연 로딩)로 시트를 `unknown[][]` 로 읽고, 순수 함수 `sheetToCsv` 가 헤더 행을 탐지해 CSV 문자열로 만든 뒤, `Blob(type: "text/csv")` 으로 Storage 에 올린다. 서버 라우트·Inngest 워커·미리보기 라우트·DB 스키마는 한 줄도 바뀌지 않는다.

**Tech Stack:** Next.js 15 · TypeScript strict · Vitest + Testing Library · `read-excel-file` 9.3.10 (MIT)

**Spec:** `docs/superpowers/specs/2026-08-31-xlsx-upload-design.md`

## Global Constraints

- 순수 로직은 `src/lib/` 에 둔다. 새 모듈은 `src/lib/xlsx/` 다
- 테스트를 먼저 쓰고, 실패를 확인한 뒤, 통과하는 구현을 쓴다 (TDD)
- 서버 코드(`src/app/api/`)·워커(`src/inngest/`)·마이그레이션(`supabase/migrations/`)을 수정하지 않는다. 이 계획에 그런 작업은 없다
- 커밋 메시지는 conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`)
- TypeScript strict — `any` 금지, 배열 인덱싱 결과는 `undefined` 가능성을 처리한다
- 테스트 실행은 `npm run test`, 린트는 `npm run lint` (`--max-warnings=0`)
- 지원 확장자는 `.csv` 와 `.xlsx` 뿐이다. `.xls` 는 범위 밖

---

### Task 1: `sheetToCsv` — 시트 배열을 CSV 문자열로

이 계획의 본체다. 순수 함수 하나이고 외부 의존성이 없다.

**Files:**
- Create: `src/lib/xlsx/sheetToCsv.ts`
- Test: `src/lib/xlsx/sheetToCsv.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수)
- Produces: `export function sheetToCsv(sheet: readonly (readonly unknown[])[]): string`
  - 데이터가 없거나 헤더로 볼 만한 행이 없으면 빈 문자열 `""` 을 돌려준다. Task 3 이 이 값으로 "표를 찾지 못했습니다" 를 판정한다
  - 줄 구분자는 `\r\n`, 마지막 줄 뒤에는 개행을 붙이지 않는다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/xlsx/sheetToCsv.test.ts` 를 만든다. fixture 는 실제 `이용대금명세서_20260803.xlsx` 의 모양을 그대로 본떴다 — 1행 제목, 2행 헤더(개행 셀 포함), 3행 서브헤더, A열 통째로 빈 열, 하단 합계행.

```ts
import { describe, expect, it } from "vitest";

import { sheetToCsv } from "./sheetToCsv";

/** 실제 카드사 이용대금명세서의 모양. A열은 통째로 비어 있고, 1행은 제목이다. */
const STATEMENT_SHEET: unknown[][] = [
  [null, "> 카드이용내역", null, null, null, null],
  [null, "이용일자", "이용카드", "이용가맹점", "이용금액", "적립예정\n포인트"],
  [null, null, null, null, "원금", "수수료"],
  [null, "26.07.02", "마스터031", "매머드커피 판교역점", 6200, null],
  [null, "26.07.03", "마스터031", "ANTHROPIC* CLAUDE SUB", 34636, null],
  [null, "합   계    2 건", null, null, 40836, null],
];

describe("sheetToCsv", () => {
  it("제목행을 버리고 가장 많이 채워진 행을 헤더로 잡는다", () => {
    const lines = sheetToCsv(STATEMENT_SHEET).split("\r\n");

    expect(lines[0]).toBe('이용일자,이용카드,이용가맹점,이용금액,"적립예정\n포인트"');
    expect(lines).toHaveLength(5);
  });

  it("통째로 빈 열을 버린다", () => {
    const lines = sheetToCsv(STATEMENT_SHEET).split("\r\n");

    expect(lines[2]).toBe("26.07.02,마스터031,매머드커피 판교역점,6200,");
  });

  it("헤더 아래 서브헤더와 합계행은 데이터 행으로 그대로 내려보낸다", () => {
    const lines = sheetToCsv(STATEMENT_SHEET).split("\r\n");

    expect(lines[1]).toBe(",,,원금,수수료");
    expect(lines[4]).toBe("합   계    2 건,,,40836,");
  });

  it("쉼표와 따옴표가 든 셀을 이스케이프한다", () => {
    const csv = sheetToCsv([
      ["가맹점", "금액"],
      ['스타벅스, 강남점', '그는 "안녕"이라 했다'],
    ]);

    expect(csv).toBe('가맹점,금액\r\n"스타벅스, 강남점","그는 ""안녕""이라 했다"');
  });

  it("Date 셀을 YYYY-MM-DD 로 쓴다", () => {
    const csv = sheetToCsv([
      ["이용일자", "금액"],
      [new Date(Date.UTC(2026, 6, 2)), 6200],
    ]);

    expect(csv).toBe("이용일자,금액\r\n2026-07-02,6200");
  });

  it("큰 정수를 지수 표기로 쓰지 않는다", () => {
    const csv = sheetToCsv([
      ["금액", "비고"],
      [1e21, "큰 수"],
    ]);

    expect(csv).toBe("금액,비고\r\n1000000000000000000000,큰 수");
  });

  it("헤더 후보가 동률이면 위쪽 행을 고른다", () => {
    const csv = sheetToCsv([
      ["잡소리"],
      ["날짜", "금액"],
      ["윗줄", "아랫줄"],
    ]);

    expect(csv).toBe("날짜,금액\r\n윗줄,아랫줄");
  });

  it("완전히 빈 행을 버린다", () => {
    const csv = sheetToCsv([
      ["날짜", "금액"],
      [null, null],
      ["26.07.02", 6200],
    ]);

    expect(csv).toBe("날짜,금액\r\n26.07.02,6200");
  });

  it("헤더로 볼 만한 행이 없으면 빈 문자열을 돌려준다", () => {
    expect(sheetToCsv([])).toBe("");
    expect(sheetToCsv([[null, null], ["한칸만"]])).toBe("");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

실행: `npx vitest run src/lib/xlsx/sheetToCsv.test.ts`
예상: 모듈을 찾지 못해 FAIL (`Failed to resolve import "./sheetToCsv"`)

- [ ] **Step 3: 최소 구현을 쓴다**

`src/lib/xlsx/sheetToCsv.ts`:

```ts
/**
 * 헤더를 찾을 때 훑는 최대 행 수. 카드사 명세서의 안내 문구가 이보다 길어지는
 * 경우는 보지 못했고, 더 내려가면 데이터 행을 헤더로 오인할 여지만 커진다.
 */
const HEADER_SEARCH_LIMIT = 20;

/** 헤더로 인정하는 최소 칸 수. 제목 한 칸짜리 행을 헤더로 잡지 않기 위한 하한. */
const HEADER_MIN_FILLED_CELLS = 2;

function toIsoDate(value: Date): string {
  return [
    String(value.getUTCFullYear()).padStart(4, "0"),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function numberToPlainString(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }

  // String(1e21) 은 "1e+21" 이다. 지수 표기가 금액 파서로 넘어가면 안 된다.
  if (Number.isInteger(value) && Math.abs(value) >= 1e21) {
    return BigInt(value).toString();
  }

  return String(value);
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return toIsoDate(value);
  }

  if (typeof value === "number") {
    return numberToPlainString(value);
  }

  return String(value);
}

function escapeCell(value: string): string {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}

function countFilled(row: readonly string[]): number {
  return row.filter((cell) => cell.trim() !== "").length;
}

function findHeaderIndex(rows: readonly (readonly string[])[]): number {
  const limit = Math.min(rows.length, HEADER_SEARCH_LIMIT);
  let bestIndex = -1;
  let bestCount = 0;

  for (let index = 0; index < limit; index += 1) {
    // 동률일 때 위쪽을 남기려면 비교는 반드시 > 여야 한다.
    const count = countFilled(rows[index] ?? []);

    if (count > bestCount) {
      bestCount = count;
      bestIndex = index;
    }
  }

  return bestCount >= HEADER_MIN_FILLED_CELLS ? bestIndex : -1;
}

function usedColumnIndexes(rows: readonly (readonly string[])[]): number[] {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const indexes: number[] = [];

  for (let index = 0; index < width; index += 1) {
    if (rows.some((row) => (row[index] ?? "").trim() !== "")) {
      indexes.push(index);
    }
  }

  return indexes;
}

export function sheetToCsv(sheet: readonly (readonly unknown[])[]): string {
  const rows = sheet.map((row) => row.map(cellToString));
  const headerIndex = findHeaderIndex(rows);

  if (headerIndex < 0) {
    return "";
  }

  const body = rows.slice(headerIndex).filter((row) => countFilled(row) > 0);
  const columns = usedColumnIndexes(body);

  return body
    .map((row) => columns.map((index) => escapeCell(row[index] ?? "")).join(","))
    .join("\r\n");
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

실행: `npx vitest run src/lib/xlsx/sheetToCsv.test.ts`
예상: 9개 테스트 모두 PASS

- [ ] **Step 5: 커밋한다**

```bash
git add src/lib/xlsx/sheetToCsv.ts src/lib/xlsx/sheetToCsv.test.ts
git commit -m "feat(upload): 엑셀 시트를 헤더 행부터 CSV 로 옮긴다"
```

---

### Task 2: `readSheet` — read-excel-file 경계

의존성을 하나 추가하고, 라이브러리 호출만 감싸는 얇은 층을 만든다. 로직은 없다.

**Files:**
- Modify: `package.json` (dependencies 에 `read-excel-file`)
- Create: `src/lib/xlsx/readSheet.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `export async function readSheet(file: File): Promise<unknown[][]>`
  - Task 3 이 `sheetToCsv(await readSheet(file))` 로 이어 붙인다
  - 파싱 실패 시 라이브러리의 예외를 그대로 던진다. 사용자 문구로 바꾸는 것은 Task 3 의 몫이다

- [ ] **Step 1: 의존성을 설치한다**

```bash
npm install read-excel-file@^9.3.10
```

- [ ] **Step 2: 설치된 버전과 라이선스를 확인한다**

실행: `npm ls read-excel-file`
예상: `read-excel-file@9.3.10` 이 dependencies 에 있다 (devDependencies 아님 — 클라이언트 런타임에서 쓴다)

- [ ] **Step 3: 래퍼를 쓴다**

`src/lib/xlsx/readSheet.ts`:

```ts
/**
 * 사용자가 xlsx 를 고른 순간에만 파서를 내려받는다. CSV 만 올리는 대다수
 * 사용자의 번들에 넣지 않기 위해 정적 import 를 쓰지 않는다.
 */
export async function readSheet(file: File): Promise<unknown[][]> {
  const { default: readXlsxFile } = await import("read-excel-file");

  return readXlsxFile(file);
}
```

- [ ] **Step 4: 타입 검사와 린트를 통과하는지 확인한다**

실행: `npx tsc --noEmit && npm run lint`
예상: 오류 없음. `read-excel-file` 이 자체 타입 정의를 포함하므로 `@types/*` 는 필요 없다

- [ ] **Step 5: 커밋한다**

```bash
git add package.json package-lock.json src/lib/xlsx/readSheet.ts
git commit -m "feat(upload): 브라우저에서 xlsx 시트를 읽는 경계를 둔다"
```

---

### Task 3: `UploadDialog` — xlsx 분기

기존 테스트 중 **xlsx 를 거부하는 것을 검증하던 테스트가 있다.** 그 테스트를 뒤집는 것이 이 태스크의 일부다.

**Files:**
- Modify: `src/components/UploadDialog.tsx`
- Test: `src/components/UploadDialog.test.tsx` (기존 파일 수정 + 케이스 추가)

**Interfaces:**
- Consumes: `sheetToCsv` (Task 1), `readSheet` (Task 2)
- Produces: 없음 (UI 종단)

- [ ] **Step 1: 기존 테스트를 새 동작에 맞게 고치고, 실패하는 테스트를 추가한다**

`src/components/UploadDialog.test.tsx` 를 세 군데 고친다.

**(a) 파일 입력 라벨이 "CSV 파일" → "명세서 파일" 로 바뀐다.** `screen.getByLabelText("CSV 파일")` 이 나오는 곳 **두 군데를 모두** `screen.getByLabelText("명세서 파일")` 로 바꾼다.

**(b) 첫 테스트의 거부 대상을 xlsx 에서 pdf 로 바꾼다.** 지금은 이렇게 되어 있다:

```ts
  it("opens with the first card default and rejects non-CSV files before any network call", async () => {
```

이 `it(...)` 블록에서 파일 생성과 단언 부분을 다음으로 교체한다(나머지 줄은 그대로 둔다):

```ts
    fireEvent.change(screen.getByLabelText("명세서 파일"), {
      target: {
        files: [new File(["fake"], "statement.pdf", { type: "application/pdf" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "업로드 시작" }));

    expect(
      await screen.findByText("CSV 또는 엑셀(.xlsx) 파일만 올릴 수 있습니다."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
```

테스트 이름도 `rejects unsupported files before any network call` 로 바꾼다.

**(c) xlsx 케이스를 추가한다.** 파일 맨 위 `vi.mock` 블록 아래에 `readSheet` 모킹을 더한다:

```ts
const readSheetMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/xlsx/readSheet", () => ({
  readSheet: readSheetMock,
}));
```

그리고 `describe` 안에 테스트 두 개를 추가한다:

```ts
  it("converts a selected xlsx to CSV and uploads the converted blob", async () => {
    readSheetMock.mockResolvedValue([
      [null, "> 카드이용내역", null],
      [null, "이용일자", "이용금액"],
      [null, "26.07.02", 6200],
    ]);
    uploadToSignedUrlMock.mockResolvedValue({ data: { path: "path" }, error: null });
    createBrowserClientMock.mockReturnValue({
      storage: {
        from: vi.fn(() => ({ uploadToSignedUrl: uploadToSignedUrlMock })),
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            contentType: "text/csv",
            jobId: "job-2",
            path: "user-1/job-2/server.csv",
            token: "signed-token",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "job-2", status: "parsing" }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const onUploadStarted = vi.fn();
    render(<UploadDialog cardLabels={["카드 1"]} onUploadStarted={onUploadStarted} />);

    await openDialog();
    fireEvent.change(screen.getByLabelText("명세서 파일"), {
      target: {
        files: [
          new File(["fake"], "이용대금명세서.xlsx", {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "업로드 시작" }));

    await waitFor(() => {
      expect(onUploadStarted).toHaveBeenCalledWith(
        expect.objectContaining({ id: "job-2", status: "parsing" }),
      );
    });

    const expectedCsv = "이용일자,이용금액\r\n26.07.02,6200";
    const [, signedRequest] = fetchMock.mock.calls[0] as [string, RequestInit];

    // 원본 파일명은 .xlsx 그대로 보내되, 형식과 크기는 변환 결과를 따른다.
    expect(JSON.parse(String(signedRequest.body))).toEqual({
      cardLabel: "카드 1",
      contentType: "text/csv",
      filename: "이용대금명세서.xlsx",
      size: new Blob([expectedCsv]).size,
    });

    const uploadedBlob = uploadToSignedUrlMock.mock.calls[0]?.[2] as Blob;

    expect(uploadedBlob.type).toBe("text/csv");
    expect(await uploadedBlob.text()).toBe(expectedCsv);
  });
```

`new Blob([...]).size` 와 `Blob.text()` 는 jsdom 26 에서 동작한다. 혹시 `text()` 가 없다는 오류가 나면 `new TextEncoder().encode(expectedCsv).length` 로 크기를 계산하고, 내용 비교는 `new Response(uploadedBlob).text()` 로 바꾼다.

```ts

  it("shows a readable error when the xlsx cannot be parsed", async () => {
    readSheetMock.mockRejectedValue(new Error("boom"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<UploadDialog cardLabels={["카드 1"]} onUploadStarted={vi.fn()} />);

    await openDialog();
    fireEvent.change(screen.getByLabelText("명세서 파일"), {
      target: {
        files: [new File(["fake"], "broken.xlsx", { type: "" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "업로드 시작" }));

    expect(
      await screen.findByText(
        "엑셀 파일을 읽지 못했습니다. 카드사에서 CSV 로 내려받아 올려주세요.",
      ),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

실행: `npx vitest run src/components/UploadDialog.test.tsx`
예상: FAIL. 라벨 "명세서 파일" 을 찾지 못하고, `@/lib/xlsx/readSheet` 모킹 대상이 아직 `UploadDialog` 에서 쓰이지 않는다

- [ ] **Step 3: 구현을 쓴다**

`src/components/UploadDialog.tsx` 를 고친다.

**(a) import 를 더한다** (`createBrowserClient` import 아래):

```ts
import { readSheet } from "@/lib/xlsx/readSheet";
import { sheetToCsv } from "@/lib/xlsx/sheetToCsv";
```

**(b) 상수를 바꾼다.** `CSV_ONLY_MESSAGE` 를 지우고 세 개를 둔다:

```ts
const UNSUPPORTED_FILE_MESSAGE = "CSV 또는 엑셀(.xlsx) 파일만 올릴 수 있습니다.";
const XLSX_READ_FAILED_MESSAGE =
  "엑셀 파일을 읽지 못했습니다. 카드사에서 CSV 로 내려받아 올려주세요.";
const XLSX_EMPTY_MESSAGE = "표를 찾지 못했습니다. 파일을 확인해 주세요.";
```

**(c) `isCsvFile` 을 세 함수로 넓힌다:**

```ts
function hasExtension(file: File, extension: string): boolean {
  return file.name.toLocaleLowerCase("ko-KR").endsWith(extension);
}

function isCsvFile(file: File): boolean {
  return file.size > 0 && hasExtension(file, ".csv");
}

function isXlsxFile(file: File): boolean {
  return file.size > 0 && hasExtension(file, ".xlsx");
}

/**
 * xlsx 는 브라우저에서 CSV 로 바꿔 올린다. Storage 에 올라가는 바이트는
 * CSV 하나뿐이므로 워커는 지금 그대로 둔다.
 */
async function toUploadBlob(file: File): Promise<Blob> {
  if (!isXlsxFile(file)) {
    return file;
  }

  let csv: string;

  try {
    csv = sheetToCsv(await readSheet(file));
  } catch {
    throw new Error(XLSX_READ_FAILED_MESSAGE);
  }

  if (csv === "") {
    throw new Error(XLSX_EMPTY_MESSAGE);
  }

  return new Blob([csv], { type: CSV_CONTENT_TYPE });
}
```

**(d) `handleSubmit` 의 가드와 업로드 대상을 바꾼다.** 가드는:

```ts
    if (
      !selectedFile ||
      (!isCsvFile(selectedFile) && !isXlsxFile(selectedFile))
    ) {
      setErrorMessage(UNSUPPORTED_FILE_MESSAGE);
      return;
    }
```

`try` 블록 안에서 `const contentType = selectedFile.type || CSV_CONTENT_TYPE;` 로 시작하던 세 줄을 다음으로 바꾼다. **변환이 signed-url 요청보다 먼저여야 한다** — 서버가 클라이언트의 `size` 를 상한과 대조하고 그 값을 서명에 넣기 때문이다:

```ts
      const payload = await toUploadBlob(selectedFile);
      const signedResponse = await fetch("/api/uploads/signed-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: selectedFile.name,
          contentType: payload.type || CSV_CONTENT_TYPE,
          size: payload.size,
          cardLabel,
        }),
      });
```

그리고 Storage 업로드의 세 번째 인자를 `selectedFile` 에서 `payload` 로 바꾼다:

```ts
        .uploadToSignedUrl(signed.path, signed.token, payload, {
          contentType: signed.contentType,
        });
```

**(e) UI 문구와 `accept` 를 바꾼다.**

- 부제 `CSV 파일과 카드 이름만 정하면 처리는 대시보드에서 이어집니다.` → `CSV 나 엑셀 파일과 카드 이름만 정하면 처리는 대시보드에서 이어집니다.`
- 라벨 `<span className="upload-dialog__label">CSV 파일</span>` → `명세서 파일`
- `accept=".csv,text/csv"` → `accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"`

**(f) 카드사 안내 목록을 고친다.** 이 목록은 지금 전부 "CSV 로 저장하라"고 지시하는데, xlsx 를 받게 되면 틀린 안내가 된다. `<section className="upload-dialog__guide">` 블록(현행 `UploadDialog.tsx:287-297`)의 제목과 목록을 다음으로 바꾼다:

```tsx
          <section className="upload-dialog__guide" aria-labelledby="csv-guide">
            <h3 className="upload-dialog__guide-title" id="csv-guide">
              명세서 받는 법
            </h3>
            <ul className="upload-dialog__guide-list">
              <li>신한카드: 마이페이지 결제내역에서 파일 저장</li>
              <li>KB국민카드: 이용내역 조회 후 파일 저장</li>
              <li>현대카드: 이용대금명세서 상세 내역 내려받기</li>
              <li>삼성카드: 카드 이용내역에서 파일 저장</li>
              <li>우리은행: 카드/계좌 거래내역 조회 후 다운로드</li>
            </ul>
            <p className="upload-dialog__guide-note">
              엑셀은 .xlsx 만 됩니다. .xls 로 받아졌다면 CSV 로 저장해 주세요.
            </p>
          </section>
```

`id="csv-guide"` 와 `aria-labelledby` 는 그대로 둔다 — 바꾸면 접근성 연결만 끊길 뿐 얻는 것이 없다. `upload-dialog__guide-note` 스타일이 없으면 `src/app/globals.css` 에서 `upload-dialog__guide-list` 옆에 작은 회색 문구로 하나 더한다.

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

실행: `npm run test`
예상: 전체 PASS. `UploadDialog.test.tsx` 는 4개 케이스

- [ ] **Step 5: 린트와 타입 검사를 돌린다**

실행: `npm run lint && npx tsc --noEmit`
예상: 오류 없음

- [ ] **Step 6: 커밋한다**

```bash
git add src/components/UploadDialog.tsx src/components/UploadDialog.test.tsx
git commit -m "feat(upload): 엑셀 명세서를 그대로 올릴 수 있게 한다"
```

---

### Task 4: 실제 파일로 확인

여기서 확인할 것은 변환 자체가 아니라 — 그건 Task 1 이 테스트로 덮었다 — **합계행 4개와 서브헤더 1행, 할인행 2개가 섞인 채로 기존 sanity 검사를 통과하는가** 다.

**Files:**
- 없음 (검증 전용). 문제가 나오면 그때 수정 대상을 정한다

**Interfaces:**
- Consumes: Task 3 까지의 전체 흐름
- Produces: 없음

- [ ] **Step 1: 변환 결과를 눈으로 확인한다**

`sheetToCsv` 의 판단을 먼저 오프라인으로 검증한다. `.local/` 은 이 저장소에서 gitignore 된 스크래치 디렉터리다(`.gitignore` 마지막 줄). 거기에 아래 스크립트를 쓰고 실행한다:

```ts
// .local/check-xlsx.ts
import readXlsxFile from "read-excel-file/node";

import { sheetToCsv } from "../src/lib/xlsx/sheetToCsv";

const sheet = await readXlsxFile(
  "/Users/guseonmo/Downloads/이용대금명세서_20260803.xlsx",
);
const csv = sheetToCsv(sheet);

console.log(csv.split("\r\n").slice(0, 5).join("\n"));
console.log("...");
console.log(`행 수: ${csv.split("\r\n").length}`);
```

실행: `npx tsx .local/check-xlsx.ts` (`tsx` 는 설치되어 있지 않다. `npx` 가 그 자리에서 받아 쓴다)
예상: 첫 줄이 `이용일자,이용카드,구분,이용가맹점,이용금액,...` 이고, 전체 행 수는 헤더 1 + 서브헤더 1 + 거래 46 + 할인 2 + 합계 4 = **54 안팎**

- [ ] **Step 2: 개발 서버를 띄우고 실제로 올린다**

실행: `npm run dev` 후 브라우저에서 대시보드 → 명세서 올리기 → `/Users/guseonmo/Downloads/이용대금명세서_20260803.xlsx` 선택 → 업로드 시작

- [ ] **Step 3: 결과를 판정한다**

확인할 것:

| 확인 | 기대 |
|---|---|
| 업로드 job 상태 | `parsing` 을 지나 완료로 간다. `sanity_failed` 로 떨어지지 않는다 |
| 들어간 거래 수 | 46건 내외. 합계행·서브헤더가 걸러지거나 이상 행으로 처리된다 |
| 금액 | 매머드커피 6,200원, ANTHROPIC 34,636원 등이 원본과 일치한다 |
| 날짜 | 2026-07 월로 들어간다 (2018년이 아니다) |

- [ ] **Step 4: 결과에 따라 분기한다**

- **통과하면**: `.local/check-xlsx.ts` 를 지우고 이 태스크를 닫는다. `docs/KNOWN_ISSUES.md` 에 `.xls` 미지원을 한 줄 적는다
- **sanity 에서 떨어지면**: 임계값(`src/lib/csv/thresholds.ts`)을 만지지 말 것. 그것은 CSV 업로드 전체에 영향을 준다. 대신 스펙의 "정리 범위" 결정을 다시 논의한다 — 합계행 제거를 `sheetToCsv` 에 넣을지 여부다. 사용자에게 결과를 보고하고 판단을 받는다

- [ ] **Step 5: 커밋한다**

```bash
git add docs/KNOWN_ISSUES.md
git commit -m "docs(upload): 엑셀 업로드가 xlsx 만 받는다는 것을 적는다"
```

---

## 검증 요약

| 무엇을 | 어떻게 |
|---|---|
| 헤더 탐지·빈 열 제거·이스케이프 | `src/lib/xlsx/sheetToCsv.test.ts` (Task 1) |
| xlsx 선택 → CSV 변환 → 올바른 크기/형식으로 업로드 | `src/components/UploadDialog.test.tsx` (Task 3) |
| 파싱 실패 시 읽을 수 있는 에러 | 같은 파일 (Task 3) |
| 실제 명세서가 파이프라인을 통과하는지 | 수동 end-to-end (Task 4) |
