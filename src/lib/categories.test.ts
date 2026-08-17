import { describe, expect, it } from "vitest";

import {
  CATEGORIES,
  CATEGORY_COLORS,
  CATEGORY_TOKENS,
  toCategory,
  type Category,
} from "./categories";

const EXPECTED_CATEGORIES = [
  "식비",
  "카페/간식",
  "생활/마트",
  "교통",
  "주거/통신",
  "쇼핑",
  "의료/건강",
  "문화/여가",
  "금융/보험",
  "기타",
] as const satisfies readonly Category[];

type HexColor = `#${string}`;

function hex(value: string): HexColor {
  return `#${value}`;
}

const EXPECTED_CATEGORY_COLORS = {
  식비: { light: hex("F1664B"), dark: hex("F2735A") },
  "카페/간식": { light: hex("B38D12"), dark: hex("E8B818") },
  "생활/마트": { light: hex("1F9C8B"), dark: hex("1F9C8B") },
  교통: { light: hex("2557E6"), dark: hex("2557E6") },
  "주거/통신": { light: hex("6B4FD8"), dark: hex("6B4FD8") },
  쇼핑: { light: hex("D9508B"), dark: hex("D9508B") },
  "의료/건강": { light: hex("17A46A"), dark: hex("17A46A") },
  "문화/여가": { light: hex("E07A2F"), dark: hex("E07A2F") },
  "금융/보험": { light: hex("56566B"), dark: hex("65657D") },
  기타: { light: hex("9090A5"), dark: hex("A8A8B8") },
} satisfies Record<Category, { light: string; dark: string }>;

const EXPECTED_CATEGORY_TOKENS = {
  식비: "--cat-food",
  "카페/간식": "--cat-cafe-snack",
  "생활/마트": "--cat-grocery",
  교통: "--cat-transport",
  "주거/통신": "--cat-housing-telecom",
  쇼핑: "--cat-shopping",
  "의료/건강": "--cat-health",
  "문화/여가": "--cat-culture-leisure",
  "금융/보험": "--cat-finance-insurance",
  기타: "--cat-other",
} satisfies Record<Category, string>;

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9A-F]{6})$/i.exec(hex);

  if (!match) {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  const value = match[1] as string;

  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function srgbChannelToLinear(channel: number): number {
  const srgb = channel / 255;

  return srgb <= 0.03928
    ? srgb / 12.92
    : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [red, green, blue] = hexToRgb(hex);

  return (
    0.2126 * srgbChannelToLinear(red) +
    0.7152 * srgbChannelToLinear(green) +
    0.0722 * srgbChannelToLinear(blue)
  );
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

describe("categories", () => {
  it("matches the PRD category list exactly", () => {
    expect(CATEGORIES).toHaveLength(10);
    expect(new Set(CATEGORIES).size).toBe(10);
    expect(CATEGORIES).toEqual(EXPECTED_CATEGORIES);
  });

  it("matches the DESIGN category colors exactly", () => {
    expect(CATEGORY_COLORS).toEqual(EXPECTED_CATEGORY_COLORS);
  });

  it("maps categories to globals.css CSS variable names", () => {
    expect(CATEGORY_TOKENS).toEqual(EXPECTED_CATEGORY_TOKENS);
  });

  it("keeps every category color above 3:1 contrast on its canvas", () => {
    for (const category of CATEGORIES) {
      expect(
        contrastRatio(CATEGORY_COLORS[category].light, hex("FFFFFF")),
        `${category} light color contrast`,
      ).toBeGreaterThanOrEqual(3.0);
      expect(
        contrastRatio(CATEGORY_COLORS[category].dark, hex("14141C")),
        `${category} dark color contrast`,
      ).toBeGreaterThanOrEqual(3.0);
    }
  });

  it("falls back to 기타 for unknown values", () => {
    expect(toCategory("식비")).toBe("식비");
    expect(toCategory("암호화폐")).toBe("기타");
    expect(toCategory("")).toBe("기타");
  });
});
