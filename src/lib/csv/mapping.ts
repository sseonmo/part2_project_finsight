import {
  decideTransactionType,
  parseAmount,
  type RawRow,
  type TransactionType,
} from "./amount";
import { decideDateFormat, parseDate, toSeoulDateString } from "./date";
import { normalizeHeaderForMapping } from "./parse";

export type ColumnMapping = {
  date: string;
  amount: string;
  merchant: string;
  type?: string;
};

export type ParsedRow = {
  rowIndex: number;
  transactedOn: string;
  amount: number | null;
  merchantRaw: string;
  merchantNormalized?: string;
  transactionType: TransactionType;
  raw: RawRow;
};

export type MappingTrial = {
  parsed: ParsedRow[];
  failed: number;
  total: number;
  successRate: number;
};

function buildHeaderIndex(header: string[]): Map<string, number> {
  return new Map(
    header.map((name, index) => [normalizeHeaderForMapping(name), index] as const),
  );
}

function findColumnIndex(
  headerIndex: Map<string, number>,
  columnName: string | undefined,
): number | null {
  if (!columnName) {
    return null;
  }

  return headerIndex.get(normalizeHeaderForMapping(columnName)) ?? null;
}

function cellAt(row: string[], index: number | null): string | undefined {
  return index === null ? undefined : row[index];
}

function rowToRawRow(header: string[], row: string[]): RawRow {
  return Object.fromEntries(
    header.map((name, index) => [name, row[index] ?? ""]),
  ) as RawRow;
}

export function applyMapping(
  header: string[],
  rows: string[][],
  mapping: ColumnMapping,
): MappingTrial {
  const headerIndex = buildHeaderIndex(header);
  const dateIndex = findColumnIndex(headerIndex, mapping.date);
  const amountIndex = findColumnIndex(headerIndex, mapping.amount);
  const merchantIndex = findColumnIndex(headerIndex, mapping.merchant);
  const typeIndex = findColumnIndex(headerIndex, mapping.type);
  const total = rows.length;

  if (dateIndex === null || amountIndex === null || merchantIndex === null) {
    return { parsed: [], failed: total, total, successRate: total === 0 ? 0 : 0 };
  }

  const dateFormat = decideDateFormat(
    rows.map((row) => cellAt(row, dateIndex) ?? ""),
  ).format;
  const parsed: ParsedRow[] = [];
  let failed = 0;

  rows.forEach((row, rowIndex) => {
    const rawDate = cellAt(row, dateIndex)?.trim() ?? "";
    const merchantRaw = cellAt(row, merchantIndex)?.trim() ?? "";
    const rawAmount = cellAt(row, amountIndex)?.trim() ?? "";
    const rawType = cellAt(row, typeIndex)?.trim();
    const parsedDate = parseDate(rawDate, dateFormat);

    if (!parsedDate || !merchantRaw) {
      failed += 1;
      return;
    }

    const raw = rowToRawRow(header, row);

    if (mapping.type) {
      raw.type = rawType ?? "";
    }
    raw.amount = rawAmount;

    const transactionType = decideTransactionType(raw);

    if (!transactionType) {
      failed += 1;
      return;
    }

    parsed.push({
      rowIndex,
      transactedOn: toSeoulDateString(parsedDate),
      amount: parseAmount(rawAmount),
      merchantRaw,
      transactionType,
      raw,
    });
  });

  return {
    parsed,
    failed,
    total,
    successRate: total === 0 ? 0 : parsed.length / total,
  };
}
