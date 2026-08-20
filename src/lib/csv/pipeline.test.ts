import { describe, expect, it } from "vitest";

import { applyMapping } from "./mapping";
import { parseCsv } from "./parse";
import { runSanityCheck } from "./sanity";

// 실제 카드사 명세서에서 나오는 표기 변형이 파이프라인 전체를 통과하는지 고정한다.
// 단위 테스트가 함수별 정상 입력만 보던 탓에, 정상 파일을 통째로 반려하는 결함
// 4건(따옴표·소수점·두 자리 연도·매입)이 한꺼번에 살아 있었다.
const MAPPING = {
  date: "이용일자",
  amount: "이용금액",
  merchant: "이용가맹점",
  type: "구분",
};

function runPipeline(csv: string) {
  const { header, rows } = parseCsv(csv);
  const trial = applyMapping(header, rows, MAPPING);

  return { trial, sanity: runSanityCheck(trial.parsed) };
}

describe("csv pipeline — 카드사 명세서 표기 변형", () => {
  it("천단위 쉼표를 인용한 금액과 점 구분 날짜를 읽는다", () => {
    const { trial, sanity } = runPipeline(
      '이용일자,이용가맹점,이용금액,구분\n2026.08.01,스타벅스강남,"5,100",일시불\n2026.08.02,GS25,"3,200",일시불\n',
    );

    expect(trial.successRate).toBe(1);
    expect(trial.parsed.map((row) => row.amount)).toEqual([5100, 3200]);
    expect(sanity).toEqual({ ok: true });
  });

  it("소수점을 붙여 내보낸 금액을 원 단위로 반올림해 읽는다", () => {
    const { trial, sanity } = runPipeline(
      "이용일자,이용가맹점,이용금액,구분\n2026-08-01,스타벅스,5100.00,승인\n2026-08-02,GS25,3200.50,승인\n",
    );

    expect(trial.parsed.map((row) => row.amount)).toEqual([5100, 3201]);
    expect(sanity).toEqual({ ok: true });
  });

  it("두 자리 연도 파일에서 MM/DD 를 판별한다", () => {
    const { trial, sanity } = runPipeline(
      "이용일자,이용가맹점,이용금액,구분\n08/01/26,스타벅스,5100,승인\n08/14/26,GS25,3200,승인\n",
    );

    expect(trial.dateFormat).toBe("MM/DD/YYYY");
    expect(trial.dateFormatResolvedBy).toBe("scan");
    expect(trial.parsed.map((row) => row.transactedOn)).toEqual([
      "2026-08-01",
      "2026-08-14",
    ]);
    expect(sanity).toEqual({ ok: true });
  });

  it("구분값이 매입인 파일을 지출로 읽는다", () => {
    const { trial } = runPipeline(
      "이용일자,이용가맹점,이용금액,구분\n2026-08-01,스타벅스,5100,매입\n2026-08-02,GS25,3200,매입\n",
    );

    expect(trial.successRate).toBe(1);
    expect(trial.parsed.map((row) => row.transactionType)).toEqual([
      "expense",
      "expense",
    ]);
  });

  it("상호명에 든 따옴표가 뒤따르는 행을 삼키지 않는다", () => {
    const { trial } = runPipeline(
      '이용일자,이용가맹점,이용금액,구분\n2026-08-01,15" 피자,5100,승인\n2026-08-02,GS25,3200,승인\n',
    );

    expect(trial.total).toBe(2);
    expect(trial.parsed.map((row) => row.merchantRaw)).toEqual([
      '15" 피자',
      "GS25",
    ]);
  });

  it("승인취소 행을 환불로 구분한다", () => {
    const { trial } = runPipeline(
      "이용일자,이용가맹점,이용금액,구분\n2026-08-01,스타벅스,5100,승인\n2026-08-02,스타벅스,-5100,승인취소\n",
    );

    expect(trial.parsed.map((row) => row.transactionType)).toEqual([
      "expense",
      "refund",
    ]);
  });
});
