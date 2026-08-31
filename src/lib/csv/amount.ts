export type TransactionType = "expense" | "refund" | "deposit";

export type RawRow = Record<string, string | undefined>;

// 결제방법 컬럼(일시불·할부·자동이체)이 type 으로 매핑되는 명세서가 흔하다.
// 여기 없는 결제수단은 행째로 버려지므로 지출 수단도 함께 둔다.
const EXPENSE_WORDS = [
  "승인",
  "이용",
  "매출",
  "매입",
  "결제",
  "구매",
  "일시불",
  "할부",
  "분할납부",
  "자동이체",
];
const REFUND_WORDS = ["취소", "환불", "청구취소", "매출취소", "승인취소"];
const DEPOSIT_WORDS = ["입금", "상환", "결제입금", "캐시백"];

function normalizedText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").trim();
}

export function looksNegativeAmount(value: string | undefined): boolean {
  const normalized = value?.normalize("NFKC").trim() ?? "";

  return normalized.startsWith("-") || /^\([^)]*\)$/.test(normalized);
}

// 원화에 소수 단위는 없지만 명세서는 5100.00 처럼 소수부를 내보낸다. 반면
// 5.100 의 점은 천 단위 구분자다(유럽 표기). 소수부가 세 자리 이상이면 둘을
// 구분할 수 없으므로 반려한다 — 소수점으로 읽으면 1000배 작은 금액이
// amount > 0 을 통과해 조용히 적재된다.
const AMOUNT_WITH_OPTIONAL_DECIMALS = /^-?\d+(\.\d{1,2})?$/;

export function parseAmount(raw: string): number | null {
  const normalized = raw.normalize("NFKC").trim();

  if (!normalized) {
    return null;
  }

  const numeric = normalized.replace(/[₩원,\s]/g, "").replace(/[()]/g, "");

  if (!AMOUNT_WITH_OPTIONAL_DECIMALS.test(numeric)) {
    return null;
  }

  // abs 를 먼저 취한다. Math.round 는 절반을 +∞ 쪽으로 올리므로 순서를 바꾸면
  // -1234.5 가 1234, 1234.5 가 1235 로 갈려 승인/취소 쌍이 1원 어긋난다.
  return Math.round(Math.abs(Number.parseFloat(numeric)));
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
