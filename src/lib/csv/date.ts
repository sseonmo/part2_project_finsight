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

// 네 번째 원소는 세 번째 성분의 자릿수다. 두 자리 연도가 앞에 오는 YY.MM.DD 를
// DD/MM/YY 와 구분하려면 값만으로는 부족하고 연도가 네 자리로 못박혔는지를 봐야 한다.
function partsFromSeparatedDate(
  raw: string,
): [number, number, number, number] | null {
  const match = DATE_PARTS.exec(raw);

  if (!match) {
    return null;
  }

  const first = toNumber(match[1]);
  const second = toNumber(match[2]);
  const third = toNumber(match[3]);

  return first === null || second === null || third === null
    ? null
    : [first, second, third, match[3]!.length];
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

// 세 성분이 모두 두 자리면 26.08.18 을 YY.MM.DD 로도 DD/MM/YY 로도 읽을 수 있다.
// 명세서 한 부에서는 연도가 한 값으로 고정되고 일이 여러 값을 갖는다 — 어느 쪽이
// 고정인지로 연도 위치를 가른다. 갈리지 않으면 판정하지 않는다.
function looksYearFirst(rows: [number, number, number][]): boolean {
  const validAsYearFirst = rows.every(
    ([first, second, third]) =>
      first <= 99 && second >= 1 && second <= 12 && third >= 1 && third <= 31,
  );

  if (!validAsYearFirst) {
    return false;
  }

  const firsts = new Set(rows.map(([first]) => first));
  const thirds = new Set(rows.map(([, , third]) => third));

  return firsts.size === 1 && thirds.size >= 2;
}

export function decideDateFormat(rawDates: string[]): DateFormatDecision {
  let sawSeparatedYearFirst = false;
  let sawSlashYearLast = false;
  let sawMonthDayEvidence = false;
  let sawDayMonthEvidence = false;
  let separatedRows = 0;
  const twoDigitTailRows: [number, number, number][] = [];

  for (const rawDate of rawDates) {
    const parts = partsFromSeparatedDate(rawDate);

    if (!parts) {
      continue;
    }

    separatedRows += 1;

    const [first, second, third, thirdDigits] = parts;

    if (first > 999) {
      sawSeparatedYearFirst = true;
      continue;
    }

    // 연도가 마지막인 형식. 두 자리 연도(03/14/26)도 같은 증거를 준다 —
    // third 가 네 자리일 때만 보면 14 > 12 라는 확정 증거를 버리게 된다.
    sawSlashYearLast = true;

    // first > 12 는 '일'의 증거가 되지만, third 가 두 자리면 first 가 두 자리
    // 연도일 수도 있다(YY.MM.DD 는 한국 카드사에서 흔하다). 그 경우를 '일'로
    // 확정하면 26.08.18 이 2018-08-26 으로 조용히 8년 어긋난다 — 연도가 네
    // 자리로 못박혔을 때만 증거로 받는다.
    if (first > 12 && second <= 12 && thirdDigits === 4) {
      sawDayMonthEvidence = true;
    }
    // second > 12 는 '월'이 아님을 뜻하므로 연도 위치와 무관하게 안전하다.
    if (second > 12 && first <= 12) {
      sawMonthDayEvidence = true;
    }

    if (thirdDigits <= 2) {
      twoDigitTailRows.push([first, second, third]);
    }
  }

  // 연도 위치를 확정해 주는 증거가 하나도 없고 모든 행의 꼬리가 두 자리일 때만
  // 고정/변동으로 가른다. 증거가 있으면 그쪽이 우선이다.
  if (
    !sawMonthDayEvidence &&
    !sawDayMonthEvidence &&
    !sawSeparatedYearFirst &&
    separatedRows > 0 &&
    twoDigitTailRows.length === separatedRows &&
    looksYearFirst(twoDigitTailRows)
  ) {
    return { format: "YY.MM.DD", ambiguousResolvedBy: "scan" };
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
    case "YY.MM.DD":
      return first > 99 ? null : makeSeoulDate(expandYear(first), second, third);
    default:
      return null;
  }
}
