import { describe, expect, it } from "vitest";

import { detectRecurring } from "./detect-recurring";
import type { SignalTransaction } from "./types";

function payment(
  id: string,
  transactedOn: string,
  amount = 10_000,
): SignalTransaction {
  return {
    id,
    period: `${transactedOn.slice(0, 7)}-01`,
    transactedOn,
    amount,
    category: "문화/여가",
    merchantNormalized: "STREAMING",
    categoryFallback: false,
  };
}

function detect(transactions: SignalTransaction[]) {
  return detectRecurring({ transactions });
}

describe("detectRecurring", () => {
  it("requires intervals from 25 to 35 days inclusive", () => {
    expect(
      detect([
        payment("a", "2026-01-31"),
        payment("b", "2026-02-24"),
        payment("c", "2026-03-20"),
      ]),
    ).toEqual([]);

    expect(
      detect([
        payment("a", "2026-01-31"),
        payment("b", "2026-02-25"),
        payment("c", "2026-03-22"),
      ]).some((signal) => signal.type === "recurring_payment"),
    ).toBe(true);

    expect(
      detect([
        payment("a", "2026-01-01"),
        payment("b", "2026-02-05"),
        payment("c", "2026-03-12"),
      ]).some((signal) => signal.type === "recurring_payment"),
    ).toBe(true);

    expect(
      detect([
        payment("a", "2026-01-01"),
        payment("b", "2026-02-06"),
        payment("c", "2026-03-14"),
      ]),
    ).toEqual([]);
  });

  it("requires amount variance within 10% and at least 3 occurrences", () => {
    expect(
      detect([
        payment("a", "2026-01-01", 10_000),
        payment("b", "2026-02-01", 10_900),
        payment("c", "2026-03-01", 10_000),
      ]).some((signal) => signal.type === "recurring_payment"),
    ).toBe(true);

    expect(
      detect([
        payment("a", "2026-01-01", 10_000),
        payment("b", "2026-02-01", 11_000),
        payment("c", "2026-03-01", 10_000),
      ]).some((signal) => signal.type === "recurring_payment"),
    ).toBe(true);

    expect(
      detect([
        payment("a", "2026-01-01", 10_000),
        payment("b", "2026-02-01", 11_100),
        payment("c", "2026-03-01", 10_000),
      ]).some((signal) => signal.type === "recurring_payment"),
    ).toBe(false);

    expect(
      detect([payment("a", "2026-01-01"), payment("b", "2026-02-01")]),
    ).toEqual([]);
  });

  it("requires exactly one payment per month", () => {
    expect(
      detect([
        payment("a", "2026-01-01"),
        payment("b", "2026-01-30"),
        payment("c", "2026-03-01"),
      ]),
    ).toEqual([]);
  });

  it("sets recurring_payment impact to null", () => {
    const signal = detect([
      payment("a", "2026-01-01"),
      payment("b", "2026-02-01"),
      payment("c", "2026-03-01"),
    ]).find((candidate) => candidate.type === "recurring_payment");

    expect(signal?.impact).toBeNull();
  });

  it("detects recurring price increases at 10% and annualizes the impact", () => {
    expect(
      detect([
        payment("a", "2026-01-01", 10_000),
        payment("b", "2026-02-01", 10_000),
        payment("c", "2026-03-01", 10_900),
      ]).some((signal) => signal.type === "recurring_price_up"),
    ).toBe(false);

    const atThreshold = detect([
      payment("a", "2026-01-01", 10_000),
      payment("b", "2026-02-01", 10_000),
      payment("c", "2026-03-01", 11_000),
    ]).find((signal) => signal.type === "recurring_price_up");

    expect(atThreshold?.impact).toBe(12_000);

    const aboveThreshold = detect([
      payment("a", "2026-01-01", 10_000),
      payment("b", "2026-02-01", 10_000),
      payment("c", "2026-03-01", 11_100),
    ]).find((signal) => signal.type === "recurring_price_up");

    expect(aboveThreshold?.impact).toBe(13_200);
  });

  it("ignores fallback and zero-amount transactions", () => {
    const baseline = detect([
      payment("a", "2026-01-01"),
      payment("b", "2026-02-01"),
      payment("c", "2026-03-01"),
    ]);

    const withIgnoredRows = detect([
      {
        ...payment("zero", "2026-01-15", 0),
        merchantNormalized: "STREAMING",
      },
      {
        ...payment("fallback", "2026-02-15", 100_000),
        categoryFallback: true,
      },
      payment("a", "2026-01-01"),
      payment("b", "2026-02-01"),
      payment("c", "2026-03-01"),
    ]);

    expect(withIgnoredRows).toEqual(baseline);
  });
});
