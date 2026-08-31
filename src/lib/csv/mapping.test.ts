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
    // 컬럼이 대체로 읽히면 그 컬럼을 신뢰한다. 거기서 벗어난 행은 컬럼을 잘못
    // 고른 신호일 수 있으므로 지출로 밀어 넣지 않고 실패로 남긴다.
    const trial = applyMapping(HEADER, [
      ...Array.from({ length: 9 }, () => row("2026-03-04")),
      row("2026-03-04", "가맹점", "5,100", "보류"),
    ], MAPPING);

    expect(trial.parsed).toHaveLength(9);
    expect(trial.failed).toBe(1);
  });

  it("subtracts a dateless discount row from the transaction above it", () => {
    // 카드 명세서는 할인을 독립 거래로 적지 않는다. 날짜·카드·구분을 비운 채
    // 바로 윗 거래에 딸린 행으로 내려보낸다. 그 행을 버리면 할인 전 금액이
    // 지출로 남아 조용히 과대 계상된다(실측 13,890원).
    const trial = applyMapping(HEADER, [
      row("2026-03-04", "LGUPLUS통신요금자동이체", "18,900", "승인"),
      row("", "이동통신할인", "-1,890", ""),
    ], MAPPING);

    expect(trial.parsed).toHaveLength(1);
    expect(trial.parsed[0]).toEqual(
      expect.objectContaining({
        merchantRaw: "LGUPLUS통신요금자동이체",
        amount: 17010,
      }),
    );
    expect(trial.failed).toBe(0);
  });

  it("does not subtract a dateless row when it is not a discount", () => {
    // 소계·합계 행도 날짜가 비어 있다. 금액이 음수인 행만 할인으로 본다.
    const trial = applyMapping(HEADER, [
      row("2026-03-04", "매머드커피", "6,200", "승인"),
      row("", "합   계    1 건", "6,200", ""),
    ], MAPPING);

    expect(trial.parsed).toHaveLength(1);
    expect(trial.parsed[0]?.amount).toBe(6200);
    expect(trial.failed).toBe(1);
  });

  it("keeps a leading discount row as a failure when there is nothing above it", () => {
    const trial = applyMapping(HEADER, [
      row("", "이동통신할인", "-1,890", ""),
    ], MAPPING);

    expect(trial.parsed).toEqual([]);
    expect(trial.failed).toBe(1);
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

  it("resolves the date format from every row while trialing only the sample", () => {
    // 7단계는 20행 샘플로 매핑을 검증하는데, 그 20행이 전부 같은 날이면
    // YY.MM.DD 판정에 필요한 증거가 샘플 안에 없다. 형식은 전 행에서 정한다.
    const sample = Array.from({ length: 20 }, () => row("26.07.15"));
    const allRows = [...sample, row("26.07.16"), row("26.07.17")];

    const trial = applyMapping(HEADER, sample, MAPPING, {
      dateFormatRows: allRows,
    });

    expect(trial.dateFormat).toBe("YY.MM.DD");
    expect(trial.failed).toBe(0);
    expect(trial.parsed[0]?.transactedOn).toBe("2026-07-15");
  });

  it("ignores a type column whose values are almost never recognizable", () => {
    // 카드 명세서의 `구분` 은 거래 유형이 아니라 결제 방식(리볼빙-일시)을 담는
    // 경우가 있다. 그 컬럼 하나 때문에 날짜·금액·가맹점이 멀쩡한 행을 전부
    // 버리면 첫 업로드가 통째로 실패한다. 읽을 값이 없는 컬럼은 안 읽은 것으로
    // 치고 금액 부호로 판정한다.
    const rows = [
      row("2026-03-04", "매머드커피 판교역점", "6,200", "리볼빙-일시"),
      row("2026-03-05", "샐러디 판교역점", "9,900", "리볼빙-일시"),
      row("2026-03-06", "이동통신할인", "-1,890", "리볼빙-일시"),
    ];

    const trial = applyMapping(HEADER, rows, MAPPING);

    expect(trial.failed).toBe(0);
    expect(trial.parsed.map((parsed) => parsed.transactionType)).toEqual([
      "expense",
      "expense",
      "refund",
    ]);
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
