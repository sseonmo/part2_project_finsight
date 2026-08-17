import { describe, expect, it } from "vitest";

import { assignOccurrences, buildDedupeKey } from "./dedupe";
import type { ParsedRow } from "./mapping";

function parsedRow(overrides: Partial<ParsedRow> = {}): ParsedRow {
  return {
    rowIndex: 0,
    transactedOn: "2026-03-04",
    amount: 5100,
    merchantRaw: "스타벅스 강남점",
    merchantNormalized: "STARBUCKS",
    transactionType: "expense",
    raw: {},
    ...overrides,
  };
}

describe("csv dedupe", () => {
  it("assigns occurrence by repeated date, amount, and normalized merchant within a file", () => {
    const rows = assignOccurrences([
      parsedRow({ rowIndex: 0 }),
      parsedRow({ rowIndex: 1 }),
      parsedRow({ rowIndex: 2, amount: 6200 }),
      parsedRow({ rowIndex: 3, merchantNormalized: "GS25" }),
    ]);

    expect(rows.map((row) => row.occurrence)).toEqual([0, 1, 0, 0]);
  });

  it("does not use file row order as the dedupe key occurrence", () => {
    const [firstUpload] = assignOccurrences([parsedRow({ rowIndex: 7 })]);
    const [overlappingUpload] = assignOccurrences([parsedRow({ rowIndex: 42 })]);

    expect(firstUpload?.occurrence).toBe(0);
    expect(overlappingUpload?.occurrence).toBe(0);
  });

  it("builds deterministic keys and keeps card labels in the hash input", () => {
    const base = {
      userId: "user-1",
      cardLabel: "카드 1",
      transactedOn: "2026-03-04",
      amount: 5100,
      merchantNormalized: "STARBUCKS",
      occurrence: 0,
    };

    expect(buildDedupeKey(base)).toMatch(/^[a-f0-9]{64}$/);
    expect(buildDedupeKey(base)).toBe(buildDedupeKey({ ...base }));
    expect(buildDedupeKey(base)).not.toBe(
      buildDedupeKey({ ...base, cardLabel: "카드 2" }),
    );
  });
});
