import { describe, expect, it } from "vitest";

import { runSanityCheck } from "./sanity";
import type { ParsedRow } from "./mapping";

function currentSeoulYear(): number {
  return Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
    }).format(new Date()),
  );
}

function parsedRow(overrides: Partial<ParsedRow> = {}): ParsedRow {
  return {
    rowIndex: 0,
    transactedOn: `${currentSeoulYear()}-03-04`,
    amount: 5100,
    merchantRaw: "스타벅스 강남점",
    transactionType: "expense",
    raw: {},
    ...overrides,
  };
}

function rowsWithBadDates(percent: number): ParsedRow[] {
  const futureDate = `${currentSeoulYear() + 1}-01-01`;

  return Array.from({ length: 100 }, (_, index) =>
    parsedRow(index < percent ? { transactedOn: futureDate } : undefined),
  );
}

function rowsWithBadAmounts(percent: number): ParsedRow[] {
  return Array.from({ length: 100 }, (_, index) =>
    parsedRow(index < percent ? { amount: index % 2 === 0 ? 0 : null } : undefined),
  );
}

describe("csv sanity", () => {
  it.each([4, 5])("allows future or too-old dates at %d%%", (percent) => {
    expect(runSanityCheck(rowsWithBadDates(percent))).toEqual({ ok: true });
  });

  it("rejects future or too-old dates above 5%", () => {
    expect(runSanityCheck(rowsWithBadDates(6))).toEqual({
      ok: false,
      reason: "거래일이 미래이거나 10년 이전인 행이 너무 많습니다.",
    });
  });

  it.each([29, 30])("allows zero or unreadable amounts at %d%%", (percent) => {
    expect(runSanityCheck(rowsWithBadAmounts(percent))).toEqual({ ok: true });
  });

  it("rejects zero or unreadable amounts above 30%", () => {
    expect(runSanityCheck(rowsWithBadAmounts(31))).toEqual({
      ok: false,
      reason: "금액이 0원이거나 읽을 수 없는 행이 너무 많습니다.",
    });
  });

  it("rejects files with no valid transactions", () => {
    expect(runSanityCheck([])).toEqual({
      ok: false,
      reason: "거래가 없는 파일입니다.",
    });
    expect(runSanityCheck([parsedRow({ amount: 0 }), parsedRow({ amount: null })])).toEqual({
      ok: false,
      reason: "유효한 거래가 없는 파일입니다.",
    });
  });
});
