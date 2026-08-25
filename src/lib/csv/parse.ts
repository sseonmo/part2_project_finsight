import { createHash } from "node:crypto";

function normalizeHeaderCell(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ko-KR");
}

function isBlankRecord(record: string[]): boolean {
  return record.every((cell) => cell.trim() === "");
}

// 한 파일에서 되돌릴 수 있는 미닫힘 인용의 개수. 이만큼 넘으면 따옴표가
// 리터럴이라는 해석 자체가 틀린 것이므로 더 시도하지 않는다.
const MAX_UNCLOSED_QUOTE_RECOVERIES = 10;

function scan(
  text: string,
  literalQuoteAt: ReadonlySet<number>,
): { records: string[][]; unclosedQuoteAt: number } {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let inQuotes = false;
  let openedAt = -1;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && !literalQuoteAt.has(index)) {
      if (inQuotes) {
        if (next === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
          openedAt = -1;
        }
      } else if (cell.trim() === "") {
        // 쉼표 뒤 공백(`, "5,100"`)이 있어도 인용 필드를 연다. 앞선 공백은
        // 구분자의 일부이므로 버린다 — 남겨두면 셀 값이 ` 5,100` 이 된다.
        cell = "";
        inQuotes = true;
        openedAt = index;
      } else {
        // 인용하지 않은 필드 중간의 따옴표는 리터럴이다(RFC 4180).
        // 토글하면 상호명 하나 때문에 파일 끝까지가 한 셀로 빨려 들어간다.
        cell += '"';
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      record.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }

      record.push(cell);
      records.push(record);
      record = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  record.push(cell);

  if (!isBlankRecord(record) || records.length === 0) {
    records.push(record);
  }

  return { records, unclosedQuoteAt: inQuotes ? openedAt : -1 };
}

export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const literalQuoteAt = new Set<number>();
  let scanned = scan(text, literalQuoteAt);

  // 끝까지 닫히지 않은 인용은 상호명에 그대로 들어간 따옴표다(`15" 피자`).
  // 인용으로 두면 뒤따르는 행이 통째로 그 셀에 빨려 들어가 거래가 조용히
  // 사라진다 — 실패율 게이트에도 sanity check 에도 걸리지 않는다.
  // 그 자리만 리터럴로 되돌려 다시 읽는다.
  for (
    let attempt = 0;
    scanned.unclosedQuoteAt >= 0 && attempt < MAX_UNCLOSED_QUOTE_RECOVERIES;
    attempt += 1
  ) {
    literalQuoteAt.add(scanned.unclosedQuoteAt);
    scanned = scan(text, literalQuoteAt);
  }

  const [rawHeader, ...rawRows] = scanned.records;
  const header = (rawHeader ?? []).map((value, index) =>
    index === 0 ? value.replace(/^\uFEFF/, "") : value,
  );
  const rows = rawRows.filter((row) => !isBlankRecord(row));

  return { header, rows };
}

export function hashHeader(header: string[]): string {
  const normalized = header.map(normalizeHeaderCell).join("\u001F");

  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function normalizeHeaderForMapping(value: string): string {
  return normalizeHeaderCell(value);
}
