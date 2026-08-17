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
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
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
