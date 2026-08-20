export type DateFormatDecision = {
  format: string;
  ambiguousResolvedBy: "scan" | "assumed-iso";
};

const DATE_PARTS =
  /^\s*(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})\s*$/;
const COMPACT_YMD = /^\s*(\d{4})(\d{2})(\d{2})\s*$/;
const SEOUL_TIME_ZONE = "Asia/Seoul";

function toNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isNaN(parsed) ? null : parsed;
}

function expandYear(year: number): number {
  return year < 100 ? 2000 + year : year;
}

function partsFromSeparatedDate(raw: string): [number, number, number] | null {
  const match = DATE_PARTS.exec(raw);

  if (!match) {
    return null;
  }

  const first = toNumber(match[1]);
  const second = toNumber(match[2]);
  const third = toNumber(match[3]);

  return first === null || second === null || third === null
    ? null
    : [first, second, third];
}

function makeSeoulDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const expected = [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
  const date = new Date(Date.UTC(year, month - 1, day, -9, 0, 0, 0));

  return toSeoulDateString(date) === expected ? date : null;
}

export function toSeoulDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function decideDateFormat(rawDates: string[]): DateFormatDecision {
  let sawSeparatedYearFirst = false;
  let sawSlashYearLast = false;
  let sawMonthDayEvidence = false;
  let sawDayMonthEvidence = false;

  for (const rawDate of rawDates) {
    const parts = partsFromSeparatedDate(rawDate);

    if (!parts) {
      continue;
    }

    const [first, second] = parts;

    if (first > 999) {
      sawSeparatedYearFirst = true;
      continue;
    }

    // 연도가 마지막인 형식. 두 자리 연도(03/14/26)도 같은 증거를 준다 —
    // third 가 네 자리일 때만 보면 14 > 12 라는 확정 증거를 버리게 된다.
    sawSlashYearLast = true;

    if (first > 12 && second <= 12) {
      sawDayMonthEvidence = true;
    }
    if (second > 12 && first <= 12) {
      sawMonthDayEvidence = true;
    }
  }

  if (sawMonthDayEvidence && !sawDayMonthEvidence) {
    return { format: "MM/DD/YYYY", ambiguousResolvedBy: "scan" };
  }

  if (sawDayMonthEvidence && !sawMonthDayEvidence) {
    return { format: "DD/MM/YYYY", ambiguousResolvedBy: "scan" };
  }

  if (sawSlashYearLast) {
    return { format: "MM/DD/YYYY", ambiguousResolvedBy: "assumed-iso" };
  }

  if (sawSeparatedYearFirst) {
    return { format: "YYYY-MM-DD", ambiguousResolvedBy: "assumed-iso" };
  }

  return { format: "YYYY-MM-DD", ambiguousResolvedBy: "assumed-iso" };
}

export function parseDate(raw: string, format: string): Date | null {
  const compact = COMPACT_YMD.exec(raw);

  if (compact && format === "YYYY-MM-DD") {
    const year = toNumber(compact[1]);
    const month = toNumber(compact[2]);
    const day = toNumber(compact[3]);

    return year === null || month === null || day === null
      ? null
      : makeSeoulDate(year, month, day);
  }

  const parts = partsFromSeparatedDate(raw);

  if (!parts) {
    return null;
  }

  const [first, second, third] = parts;

  switch (format) {
    case "YYYY-MM-DD":
      return first > 999 ? makeSeoulDate(first, second, third) : null;
    case "MM/DD/YYYY":
      return makeSeoulDate(expandYear(third), first, second);
    case "DD/MM/YYYY":
      return makeSeoulDate(expandYear(third), second, first);
    default:
      return null;
  }
}
