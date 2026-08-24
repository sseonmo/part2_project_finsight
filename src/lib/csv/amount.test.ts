import { describe, expect, it } from "vitest";

import { decideTransactionType, parseAmount } from "./amount";

describe("csv amount", () => {
  it("parses amounts as positive won values", () => {
    expect(parseAmount("5,100")).toBe(5100);
    expect(parseAmount("₩12,300원")).toBe(12300);
    expect(parseAmount("-9,900")).toBe(9900);
    expect(parseAmount("(4,500)")).toBe(4500);
    expect(parseAmount("0")).toBe(0);
  });

  it("returns null for unreadable amounts", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("금액없음")).toBeNull();
  });

  it("maps Korean card statement status values to the three DB transaction types", () => {
    expect(decideTransactionType({ type: "승인" })).toBe("expense");
    expect(decideTransactionType({ type: "취소" })).toBe("refund");
    expect(decideTransactionType({ type: "환불" })).toBe("refund");
    expect(decideTransactionType({ type: "입금" })).toBe("deposit");
    expect(decideTransactionType({ type: "보류" })).toBeNull();
  });

  it("reads 결제수단 words in the type column as ordinary spending", () => {
    // 카드사 명세서의 결제방법 컬럼은 승인/취소가 아니라 일시불·할부·자동이체다.
    // 자동이체를 모르면 통신요금·보험료·구독료 행이 통째로 버려지고, 그게 바로
    // 반복 지출과 구독료 인상 탐지가 딛고 선 데이터다.
    expect(decideTransactionType({ type: "자동이체" })).toBe("expense");
    expect(decideTransactionType({ type: "할부" })).toBe("expense");
    expect(decideTransactionType({ type: "분할납부" })).toBe("expense");
    expect(decideTransactionType({ type: "정기결제" })).toBe("expense");
  });

  it("defaults to expense only when no type column exists", () => {
    expect(decideTransactionType({ amount: "5,100" })).toBe("expense");
    expect(decideTransactionType({ amount: "-5,100" })).toBe("refund");
    expect(decideTransactionType({ amount: "(5,100)" })).toBe("refund");
    expect(decideTransactionType({ type: "" })).toBeNull();
  });

  it("parses amounts from statements that export decimal places", () => {
    expect(parseAmount("5100.00")).toBe(5100);
    expect(parseAmount("1,234.56")).toBe(1235);
    expect(parseAmount("-9,900.00")).toBe(9900);
  });

  it("reads 매입 as an expense", () => {
    expect(decideTransactionType({ type: "매입" })).toBe("expense");
  });

  it("rejects a dot that may be a thousands separator instead of shrinking the amount", () => {
    // 5.100 은 유럽·일부 한국 명세서에서 5,100 을 뜻한다. 소수점으로 읽으면
    // 5 가 되어 1000배 작은 금액이 amount > 0 을 통과해 조용히 적재된다.
    expect(parseAmount("5.100")).toBeNull();
    expect(parseAmount("5.000")).toBeNull();
    // 쉼표가 먼저 제거되므로 1.234,56 은 1.23456 이 되어 1 로 적재됐다.
    expect(parseAmount("1.234,56")).toBeNull();
  });

  it("rounds 승인 and 취소 to the same magnitude", () => {
    // Math.abs(Math.round(x)) 는 음수를 0 쪽으로 반올림해 부호 쌍이 1원 어긋난다.
    expect(parseAmount("-1,234.50")).toBe(parseAmount("1,234.50"));
    expect(parseAmount("-1,234.50")).toBe(1235);
  });

});
