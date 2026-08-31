import {
  decideTransactionType,
  looksNegativeAmount,
  parseAmount,
  type RawRow,
  type TransactionType,
} from "./amount";
import { decideDateFormat, parseDate, toSeoulDateString } from "./date";
import { normalizeHeaderForMapping } from "./parse";
import { CSV_TYPE_RECOGNITION_RATE_MIN } from "./thresholds";

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
  dateFormat: string;
  dateFormatResolvedBy: "scan" | "assumed-iso";
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

/**
 * type 컬럼을 믿을지 정한다. 값이 유형으로 읽히지 않으면 `decideTransactionType`
 * 이 행마다 null 을 돌려주고 `applyMapping` 이 그 행을 통째로 버리는데, 날짜와
 * 금액과 가맹점이 멀쩡한 행까지 사라진다. 실제 카드 명세서의 `구분` 컬럼이
 * 전 행 `리볼빙-일시` 여서 46건이 한 건도 남지 않은 적이 있다(KNOWN_ISSUES ⓚ).
 * 그래서 읽히는 비율을 먼저 보고, 낮으면 그 컬럼은 없는 셈 치고 금액 부호로
 * 판정한다. 반대로 대부분 읽히는 컬럼은 신뢰해 예외 행을 실패로 남긴다 —
 * 그것은 컬럼을 잘못 고른 신호일 수 있다.
 */
function isTypeColumnReadable(
  rows: string[][],
  typeIndex: number | null,
): boolean {
  if (typeIndex === null) {
    return false;
  }

  const values = rows
    .map((row) => cellAt(row, typeIndex)?.trim() ?? "")
    .filter((value) => value !== "");

  if (values.length === 0) {
    return false;
  }

  const readable = values.filter(
    (value) => decideTransactionType({ type: value, amount: "0" }) !== null,
  ).length;

  return readable / values.length >= CSV_TYPE_RECOGNITION_RATE_MIN;
}

export function applyMapping(
  header: string[],
  rows: string[][],
  mapping: ColumnMapping,
  // 날짜 형식 판별에만 쓰는 행. 샘플 20행만 시험 파싱하면서 형식은 전 행에서
  // 정해야 하는 7단계를 위한 것이다 — 샘플이 전부 같은 날이면 그 안에는
  // YY.MM.DD 를 가릴 증거가 없다.
  options?: { dateFormatRows?: string[][] },
): MappingTrial {
  const headerIndex = buildHeaderIndex(header);
  const dateIndex = findColumnIndex(headerIndex, mapping.date);
  const amountIndex = findColumnIndex(headerIndex, mapping.amount);
  const merchantIndex = findColumnIndex(headerIndex, mapping.merchant);
  const declaredTypeIndex = findColumnIndex(headerIndex, mapping.type);
  const typeIndex = isTypeColumnReadable(rows, declaredTypeIndex)
    ? declaredTypeIndex
    : null;
  const total = rows.length;

  if (dateIndex === null || amountIndex === null || merchantIndex === null) {
    const dateDecision = decideDateFormat([]);

    return {
      parsed: [],
      failed: total,
      total,
      successRate: 0,
      dateFormat: dateDecision.format,
      dateFormatResolvedBy: dateDecision.ambiguousResolvedBy,
    };
  }

  const dateDecision = decideDateFormat(
    (options?.dateFormatRows ?? rows).map(
      (row) => cellAt(row, dateIndex) ?? "",
    ),
  );
  const dateFormat = dateDecision.format;
  const parsed: ParsedRow[] = [];
  let failed = 0;

  rows.forEach((row, rowIndex) => {
    const rawDate = cellAt(row, dateIndex)?.trim() ?? "";
    const merchantRaw = cellAt(row, merchantIndex)?.trim() ?? "";
    const rawAmount = cellAt(row, amountIndex)?.trim() ?? "";
    const rawType = cellAt(row, typeIndex)?.trim();
    const parsedDate = parseDate(rawDate, dateFormat);

    // 카드 명세서는 할인을 독립 거래로 적지 않는다. 날짜와 구분을 비운 채 바로
    // 윗 거래에 딸린 행으로 내려보내므로, 그대로 버리면 할인 전 금액이 지출로
    // 남는다. 날짜가 없고 금액이 음수인 행만 윗 거래에서 뺀다 — 소계·합계 행도
    // 날짜가 비어 있어서 부호로 갈라야 한다.
    if (!parsedDate && merchantRaw && looksNegativeAmount(rawAmount)) {
      const previous = parsed.at(-1);
      const discount = parseAmount(rawAmount);

      if (previous && previous.amount !== null && discount !== null) {
        previous.amount -= discount;
        return;
      }
    }

    if (!parsedDate || !merchantRaw) {
      failed += 1;
      return;
    }

    const raw = rowToRawRow(header, row);

    if (typeIndex !== null) {
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
    dateFormat,
    dateFormatResolvedBy: dateDecision.ambiguousResolvedBy,
  };
}
