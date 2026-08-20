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

});
