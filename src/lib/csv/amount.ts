export type TransactionType = "expense" | "refund" | "deposit";

export type RawRow = Record<string, string | undefined>;

const EXPENSE_WORDS = ["승인", "이용", "매출", "결제", "구매", "일시불"];
const REFUND_WORDS = ["취소", "환불", "청구취소", "매출취소", "승인취소"];
const DEPOSIT_WORDS = ["입금", "상환", "결제입금", "캐시백"];

function normalizedText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").trim();
}

function looksNegativeAmount(value: string | undefined): boolean {
  const normalized = value?.normalize("NFKC").trim() ?? "";

  return normalized.startsWith("-") || /^\([^)]*\)$/.test(normalized);
}

export function parseAmount(raw: string): number | null {
  const normalized = raw.normalize("NFKC").trim();

  if (!normalized) {
    return null;
  }

  const numeric = normalized.replace(/[₩원,\s]/g, "").replace(/[()]/g, "");

  if (!/^-?\d+$/.test(numeric)) {
    return null;
  }

  return Math.abs(Number.parseInt(numeric, 10));
}

export function decideTransactionType(row: RawRow): TransactionType | null {
  if (!Object.prototype.hasOwnProperty.call(row, "type")) {
    return looksNegativeAmount(row.amount) ? "refund" : "expense";
  }

  const typeValue = normalizedText(row.type ?? "");

  if (!typeValue) {
    return null;
  }

  if (REFUND_WORDS.some((word) => typeValue.includes(word))) {
    return "refund";
  }

  if (DEPOSIT_WORDS.some((word) => typeValue.includes(word))) {
    return "deposit";
  }

  if (EXPENSE_WORDS.some((word) => typeValue.includes(word))) {
    return "expense";
  }

  return null;
}
