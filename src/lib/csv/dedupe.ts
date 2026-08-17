import { createHash } from "node:crypto";

import type { ParsedRow } from "./mapping";

function occurrenceKey(row: ParsedRow): string {
  return [
    row.transactedOn,
    row.amount === null ? "" : String(row.amount),
    row.merchantNormalized ?? row.merchantRaw,
  ].join("|");
}

export function assignOccurrences(
  rows: ParsedRow[],
): (ParsedRow & { occurrence: number })[] {
  const counts = new Map<string, number>();

  return rows.map((row) => {
    const key = occurrenceKey(row);
    const occurrence = counts.get(key) ?? 0;
    counts.set(key, occurrence + 1);

    return { ...row, occurrence };
  });
}

export function buildDedupeKey(input: {
  userId: string;
  cardLabel: string;
  transactedOn: string;
  amount: number;
  merchantNormalized: string;
  occurrence: number;
}): string {
  const material = [
    input.userId,
    input.cardLabel,
    input.transactedOn,
    String(input.amount),
    input.merchantNormalized,
    String(input.occurrence),
  ].join("|");

  return createHash("sha256").update(material, "utf8").digest("hex");
}
