import { describe, expect, it } from "vitest";

import { CATEGORIES } from "./categories";
import { matchSeedRule, MERCHANT_SEED_RULES } from "./merchant-rules";

describe("merchant seed rules", () => {
  it("keeps the seed list to large obvious merchants only", () => {
    expect(MERCHANT_SEED_RULES.length).toBeGreaterThanOrEqual(25);
    expect(MERCHANT_SEED_RULES.length).toBeLessThanOrEqual(35);
  });

  it("uses only PRD categories", () => {
    const categories = new Set(CATEGORIES);

    for (const rule of MERCHANT_SEED_RULES) {
      expect(categories.has(rule.category), rule.pattern).toBe(true);
    }
  });

  it.each([
    ["스타벅스", "카페/간식"],
    ["GS25", "생활/마트"],
    ["쿠팡", "쇼핑"],
    ["카카오택시", "교통"],
    ["넷플릭스", "문화/여가"],
  ] as const)("matches %s as %s", (merchant, category) => {
    expect(matchSeedRule(merchant)).toBe(category);
  });

  it("returns null for merchants outside the seed set", () => {
    expect(matchSeedRule("동네문구점")).toBeNull();
  });
});
