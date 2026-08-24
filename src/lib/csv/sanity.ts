import type { ParsedRow } from "./mapping";
import {
  SANITY_AMOUNT_ANOMALY_RATE_MAX,
  SANITY_DATE_ANOMALY_RATE_MAX,
  SANITY_LOOKBACK_YEARS,
} from "./thresholds";

export type SanityResult = { ok: true } | { ok: false; reason: string };

/**
 * 데이터 행이 애초에 0건인 파일이다. 다른 사유와 달리 컬럼을 다시 골라도
 * 읽을 것이 없으므로 수동 매핑에서도 되돌리지 않는다.
 */
export const SANITY_EMPTY_FILE_REASON = "거래가 없는 파일입니다.";

function seoulDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function makeIsoDate(year: number, month: number, day: number): string {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function currentSeoulDateWindow(): { today: string; oldestAllowed: string } {
  const todayParts = seoulDateParts(new Date());

  return {
    today: makeIsoDate(todayParts.year, todayParts.month, todayParts.day),
    oldestAllowed: makeIsoDate(
      todayParts.year - SANITY_LOOKBACK_YEARS,
      todayParts.month,
      todayParts.day,
    ),
  };
}

function hasValidAmount(row: ParsedRow): boolean {
  return row.amount !== null && row.amount > 0;
}

export function runSanityCheck(rows: ParsedRow[]): SanityResult {
  if (rows.length === 0) {
    return { ok: false, reason: SANITY_EMPTY_FILE_REASON };
  }

  const { today, oldestAllowed } = currentSeoulDateWindow();
  const badDateCount = rows.filter(
    (row) => row.transactedOn > today || row.transactedOn < oldestAllowed,
  ).length;

  if (badDateCount / rows.length > SANITY_DATE_ANOMALY_RATE_MAX) {
    return {
      ok: false,
      reason: "거래일이 미래이거나 10년 이전인 행이 너무 많습니다.",
    };
  }

  const badAmountCount = rows.filter((row) => !hasValidAmount(row)).length;

  if (!rows.some(hasValidAmount)) {
    return { ok: false, reason: "유효한 거래가 없는 파일입니다." };
  }

  if (badAmountCount / rows.length > SANITY_AMOUNT_ANOMALY_RATE_MAX) {
    return {
      ok: false,
      reason: "금액이 0원이거나 읽을 수 없는 행이 너무 많습니다.",
    };
  }

  return { ok: true };
}
