export const CATEGORIES = [
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
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_COLORS: Record<
  Category,
  { light: string; dark: string }
> = {
  식비: { light: "#F1664B", dark: "#F2735A" },
  "카페/간식": { light: "#B38D12", dark: "#E8B818" },
  "생활/마트": { light: "#1F9C8B", dark: "#1F9C8B" },
  교통: { light: "#2557E6", dark: "#2557E6" },
  "주거/통신": { light: "#6B4FD8", dark: "#6B4FD8" },
  쇼핑: { light: "#D9508B", dark: "#D9508B" },
  "의료/건강": { light: "#17A46A", dark: "#17A46A" },
  "문화/여가": { light: "#E07A2F", dark: "#E07A2F" },
  "금융/보험": { light: "#56566B", dark: "#65657D" },
  기타: { light: "#9090A5", dark: "#A8A8B8" },
};

export const CATEGORY_TOKENS: Record<Category, string> = {
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
};

const CATEGORY_SET = new Set<string>(CATEGORIES);

export function toCategory(value: string): Category {
  return CATEGORY_SET.has(value) ? (value as Category) : "기타";
}
