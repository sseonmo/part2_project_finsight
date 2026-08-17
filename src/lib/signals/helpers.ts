import type { SignalTransaction } from "./types";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function isEligibleTransaction(
  transaction: SignalTransaction,
): boolean {
  return transaction.amount > 0 && transaction.categoryFallback !== true;
}

export function monthStartFromDate(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function compareByDate(
  left: SignalTransaction,
  right: SignalTransaction,
): number {
  return left.transactedOn.localeCompare(right.transactedOn);
}

export function daysBetween(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);

  return Math.round((end - start) / MILLISECONDS_PER_DAY);
}

export function monthIndex(periodOrDate: string): number {
  const [yearPart, monthPart] = periodOrDate.split("-");
  const year = Number.parseInt(yearPart ?? "", 10);
  const month = Number.parseInt(monthPart ?? "", 10);

  return year * 12 + month;
}
