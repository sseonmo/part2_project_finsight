import { describe, expect, it } from "vitest";

import { sheetToCsv } from "./sheetToCsv";

/** 실제 카드사 이용대금명세서의 모양. A열은 통째로 비어 있고, 1행은 제목이다. */
const STATEMENT_SHEET: unknown[][] = [
  [null, "> 카드이용내역", null, null, null, null],
  [null, "이용일자", "이용카드", "이용가맹점", "이용금액", "적립예정\n포인트"],
  [null, null, null, null, "원금", "수수료"],
  [null, "26.07.02", "마스터031", "매머드커피 판교역점", 6200, null],
  [null, "26.07.03", "마스터031", "ANTHROPIC* CLAUDE SUB", 34636, null],
  [null, "합   계    2 건", null, null, 40836, null],
];

describe("sheetToCsv", () => {
  it("제목행을 버리고 가장 많이 채워진 행을 헤더로 잡는다", () => {
    const lines = sheetToCsv(STATEMENT_SHEET).split("\r\n");

    expect(lines[0]).toBe('이용일자,이용카드,이용가맹점,이용금액,"적립예정\n포인트"');
    expect(lines).toHaveLength(5);
  });

  it("통째로 빈 열을 버린다", () => {
    const lines = sheetToCsv(STATEMENT_SHEET).split("\r\n");

    expect(lines[2]).toBe("26.07.02,마스터031,매머드커피 판교역점,6200,");
  });

  it("헤더 아래 서브헤더와 합계행은 데이터 행으로 그대로 내려보낸다", () => {
    const lines = sheetToCsv(STATEMENT_SHEET).split("\r\n");

    expect(lines[1]).toBe(",,,원금,수수료");
    expect(lines[4]).toBe("합   계    2 건,,,40836,");
  });

  it("쉼표와 따옴표가 든 셀을 이스케이프한다", () => {
    const csv = sheetToCsv([
      ["가맹점", "금액"],
      ['스타벅스, 강남점', '그는 "안녕"이라 했다'],
    ]);

    expect(csv).toBe('가맹점,금액\r\n"스타벅스, 강남점","그는 ""안녕""이라 했다"');
  });

  it("Date 셀을 YYYY-MM-DD 로 쓴다", () => {
    const csv = sheetToCsv([
      ["이용일자", "금액"],
      [new Date(Date.UTC(2026, 6, 2)), 6200],
    ]);

    expect(csv).toBe("이용일자,금액\r\n2026-07-02,6200");
  });

  it("큰 정수를 지수 표기로 쓰지 않는다", () => {
    const csv = sheetToCsv([
      ["금액", "비고"],
      [1e21, "큰 수"],
    ]);

    expect(csv).toBe("금액,비고\r\n1000000000000000000000,큰 수");
  });

  it("헤더 후보가 동률이면 위쪽 행을 고른다", () => {
    const csv = sheetToCsv([
      ["잡소리"],
      ["날짜", "금액"],
      ["윗줄", "아랫줄"],
    ]);

    expect(csv).toBe("날짜,금액\r\n윗줄,아랫줄");
  });

  it("완전히 빈 행을 버린다", () => {
    const csv = sheetToCsv([
      ["날짜", "금액"],
      [null, null],
      ["26.07.02", 6200],
    ]);

    expect(csv).toBe("날짜,금액\r\n26.07.02,6200");
  });

  it("헤더로 볼 만한 행이 없으면 빈 문자열을 돌려준다", () => {
    expect(sheetToCsv([])).toBe("");
    expect(sheetToCsv([[null, null], ["한칸만"]])).toBe("");
  });

  it("헤더만 있고 데이터 행이 없으면 빈 문자열을 돌려준다", () => {
    expect(sheetToCsv([["이용일자", "이용금액"]])).toBe("");
  });
});
