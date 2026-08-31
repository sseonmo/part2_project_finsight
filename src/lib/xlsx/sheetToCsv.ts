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

  if (body.length < 2) {
    return "";
  }

  const columns = usedColumnIndexes(body);

  return body
    .map((row) => columns.map((index) => escapeCell(row[index] ?? "")).join(","))
    .join("\r\n");
}
