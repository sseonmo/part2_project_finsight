import { describe, expect, it } from "vitest";

import { applyMapping, type ColumnMapping } from "./mapping";

const HEADER = ["승인일", "가맹점명", "금액", "상태"];
const MAPPING = {
  date: "승인일",
  merchant: "가맹점명",
  amount: "금액",
  type: "상태",
} satisfies ColumnMapping;

function row(date: string, merchant = "스타벅스 강남점", amount = "5,100", type = "승인") {
  return [date, merchant, amount, type];
}

function rowsWithFailures(total: number, failures: number): string[][] {
  return Array.from({ length: total }, (_, index) =>
    index < failures ? row("날짜아님") : row("2026-03-04"),
  );
}

describe("csv mapping", () => {
  it("applies a provided mapping without inferring columns", () => {
    const trial = applyMapping(HEADER, [
      row("2026-03-04", "스타벅스 강남점", "5,100", "승인"),
      row("2026-03-05", "카드취소", "-5,100", "취소"),
      row("2026-03-06", "결제계좌", "100,000", "입금"),
    ], MAPPING);

    expect(trial).toMatchObject({
      failed: 0,
      total: 3,
      successRate: 1,
    });
    expect(trial.parsed).toEqual([
      expect.objectContaining({
        transactedOn: "2026-03-04",
        merchantRaw: "스타벅스 강남점",
        amount: 5100,
        transactionType: "expense",
      }),
      expect.objectContaining({
        transactedOn: "2026-03-05",
        amount: 5100,
        transactionType: "refund",
      }),
      expect.objectContaining({
        transactedOn: "2026-03-06",
        amount: 100000,
        transactionType: "deposit",
      }),
    ]);
  });

  it("keeps unreadable amounts in parsed rows for sanity checks", () => {
    const trial = applyMapping(HEADER, [row("2026-03-04", "가맹점", "금액없음")], MAPPING);

    expect(trial.failed).toBe(0);
    expect(trial.parsed[0]).toEqual(
      expect.objectContaining({ amount: null, merchantRaw: "가맹점" }),
    );
  });

  it("skips rows with unknown transaction types instead of treating them as expenses", () => {
    const trial = applyMapping(HEADER, [row("2026-03-04", "가맹점", "5,100", "보류")], MAPPING);

    expect(trial.parsed).toEqual([]);
    expect(trial.failed).toBe(1);
    expect(trial.successRate).toBe(0);
  });

  it.each([
    [89, 0.89],
    [90, 0.9],
    [91, 0.91],
  ])("reports sample success-rate boundary %d%%", (validRows, expectedRate) => {
    const rows = rowsWithFailures(100, 100 - validRows);

    expect(applyMapping(HEADER, rows, MAPPING).successRate).toBe(expectedRate);
  });

  it.each([
    [19, 0.19],
    [20, 0.2],
    [21, 0.21],
  ])("reports full-file failure-rate boundary %d%%", (failures, expectedFailureRate) => {
    const trial = applyMapping(HEADER, rowsWithFailures(100, failures), MAPPING);

    expect(trial.failed / trial.total).toBe(expectedFailureRate);
  });

  it("uses rows beyond the first 20 when resolving ambiguous dates", () => {
    const rows = [
      ...Array.from({ length: 20 }, () => row("03/04/2026")),
      row("03/14/2026"),
    ];

    const trial = applyMapping(HEADER, rows, MAPPING);

    expect(trial.failed).toBe(0);
    expect(trial.parsed[0]?.transactedOn).toBe("2026-03-04");
    expect(trial.parsed[20]?.transactedOn).toBe("2026-03-14");
  });

  it("returns the scanned DD/MM/YYYY date format decision", () => {
    const trial = applyMapping(HEADER, [
      row("03/04/2026"),
      row("13/04/2026"),
    ], MAPPING);

    expect(trial).toMatchObject({
      dateFormat: "DD/MM/YYYY",
      dateFormatResolvedBy: "scan",
    });
  });

  it("returns the assumed MM/DD/YYYY date format decision when every date is ambiguous", () => {
    const trial = applyMapping(HEADER, [
      row("03/04/2026"),
      row("04/05/2026"),
    ], MAPPING);

    expect(trial).toMatchObject({
      dateFormat: "MM/DD/YYYY",
      dateFormatResolvedBy: "assumed-iso",
    });
  });
});
