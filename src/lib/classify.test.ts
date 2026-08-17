import { describe, expect, it } from "vitest";

import { resolveCategories } from "./classify";

describe("resolveCategories", () => {
  it("resolves by override, cache, seed rule, then unmatched order", () => {
    const result = resolveCategories({
      normalized: ["스타벅스", "캐시가맹점", "사용자수정", "미분류"],
      overrides: {
        스타벅스: "식비",
        사용자수정: "의료/건강",
      },
      cache: {
        스타벅스: "카페/간식",
        캐시가맹점: "교통",
      },
    });

    expect(result).toEqual({
      resolved: {
        스타벅스: "식비",
        캐시가맹점: "교통",
        사용자수정: "의료/건강",
      },
      unmatched: ["미분류"],
    });
  });

  it("uses seed rules before adding a merchant to LLM input", () => {
    expect(
      resolveCategories({
        normalized: ["GS25", "처음보는가게"],
        overrides: {},
        cache: {},
      }),
    ).toEqual({
      resolved: {
        GS25: "생활/마트",
      },
      unmatched: ["처음보는가게"],
    });
  });

  it("deduplicates the LLM input while preserving first-seen order", () => {
    expect(
      resolveCategories({
        normalized: ["미분류A", "미분류A", "미분류B"],
        overrides: {},
        cache: {},
      }).unmatched,
    ).toEqual(["미분류A", "미분류B"]);
  });
});
