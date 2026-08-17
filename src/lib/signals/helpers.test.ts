import { describe, expect, it } from "vitest";

import {
  daysBetween,
  isEligibleTransaction,
  monthIndex,
  monthStartFromDate,
} from "./helpers";
import type { SignalTransaction } from "./types";

function transaction(
  overrides: Partial<SignalTransaction> = {},
): SignalTransaction {
  return {
    id: "tx-1",
    period: "2026-03-01",
    transactedOn: "2026-03-04",
    amount: 10_000,
    category: "식비",
    merchantNormalized: "MERCHANT",
    categoryFallback: false,
    ...overrides,
  };
}

describe("signal helpers", () => {
  it("accepts only non-fallback positive-amount transactions", () => {
    expect(isEligibleTransaction(transaction())).toBe(true);
    expect(isEligibleTransaction(transaction({ amount: 0 }))).toBe(false);
    expect(isEligibleTransaction(transaction({ categoryFallback: true }))).toBe(
      false,
    );
  });

  it("normalizes dates to month starts and comparable month indexes", () => {
    expect(monthStartFromDate("2026-03-27")).toBe("2026-03-01");
    expect(monthIndex("2026-03-01") - monthIndex("2026-01-01")).toBe(2);
  });

  it("calculates whole-day intervals from ISO dates", () => {
    expect(daysBetween("2026-01-31", "2026-02-25")).toBe(25);
  });
});
