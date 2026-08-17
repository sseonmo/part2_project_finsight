import { describe, expect, it } from "vitest";

import { normalizeMerchant } from "./merchant";

describe("normalizeMerchant", () => {
  it.each([
    ["스타벅스커피코리아 강남2호점", "스타벅스"],
    ["KG이니시스 (주)스타벅스커피코리아 202603041234", "스타벅스"],
    ["NHN KCP ＊배달의민족", "배달의민족"],
    ["(주)쿠팡_123456789", "쿠팡"],
    ["GS25강남타워점 0042", "GS25"],
    ["씨유 역삼중앙점", "CU"],
    ["11번가(주) 202603040001", "11번가"],
    ["카카오택시_123456", "카카오택시"],
    ["맥도날드 서울역점", "맥도날드"],
    ["S-OIL셀프 강남점 1234", "S-OIL"],
  ])("normalizes card statement merchant %s", (raw, expected) => {
    expect(normalizeMerchant(raw)).toBe(expected);
  });

  it("compresses whitespace and uppercases latin text", () => {
    expect(normalizeMerchant("  nhn   kcp\tNetflix  ")).toBe("NETFLIX");
  });

  it("never returns an empty string after stripping statement noise", () => {
    expect(normalizeMerchant("  ＊ (주) 주식회사 000123  ")).toBe("000123");
  });
});
