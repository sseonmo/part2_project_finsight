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

export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes) {
        if (next === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else if (cell.trim() === "") {
        // 쉼표 뒤 공백(`, "5,100"`)이 있어도 인용 필드를 연다. 앞선 공백은
        // 구분자의 일부이므로 버린다 — 남겨두면 셀 값이 ` 5,100` 이 된다.
        cell = "";
        inQuotes = true;
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

  const [rawHeader, ...rawRows] = records;
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
