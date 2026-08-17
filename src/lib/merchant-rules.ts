import { toCategory, type Category } from "./categories";

export const MERCHANT_SEED_RULES: ReadonlyArray<{
  pattern: string;
  category: Category;
}> = [
  { pattern: "스타벅스", category: "카페/간식" },
  { pattern: "투썸플레이스", category: "카페/간식" },
  { pattern: "이디야", category: "카페/간식" },
  { pattern: "메가커피", category: "카페/간식" },
  { pattern: "컴포즈커피", category: "카페/간식" },
  { pattern: "파리바게뜨", category: "카페/간식" },
  { pattern: "배스킨라빈스", category: "카페/간식" },
  { pattern: "GS25", category: "생활/마트" },
  { pattern: "CU", category: "생활/마트" },
  { pattern: "세븐일레븐", category: "생활/마트" },
  { pattern: "7-ELEVEN", category: "생활/마트" },
  { pattern: "이마트24", category: "생활/마트" },
  { pattern: "이마트", category: "생활/마트" },
  { pattern: "홈플러스", category: "생활/마트" },
  { pattern: "롯데마트", category: "생활/마트" },
  { pattern: "올리브영", category: "생활/마트" },
  { pattern: "배달의민족", category: "식비" },
  { pattern: "요기요", category: "식비" },
  { pattern: "맥도날드", category: "식비" },
  { pattern: "롯데리아", category: "식비" },
  { pattern: "버거킹", category: "식비" },
  { pattern: "써브웨이", category: "식비" },
  { pattern: "교촌치킨", category: "식비" },
  { pattern: "BHC", category: "식비" },
  { pattern: "카카오택시", category: "교통" },
  { pattern: "티머니", category: "교통" },
  { pattern: "코레일", category: "교통" },
  { pattern: "S-OIL", category: "교통" },
  { pattern: "쿠팡", category: "쇼핑" },
  { pattern: "11번가", category: "쇼핑" },
  { pattern: "무신사", category: "쇼핑" },
  { pattern: "넷플릭스", category: "문화/여가" },
  { pattern: "NETFLIX", category: "문화/여가" },
] as const;

function normalizeForRule(value: string): string {
  return value.normalize("NFKC").toLocaleUpperCase("ko-KR").replace(/\s+/g, "");
}

export function matchSeedRule(normalized: string): Category | null {
  const target = normalizeForRule(normalized);

  for (const rule of MERCHANT_SEED_RULES) {
    if (target.includes(normalizeForRule(rule.pattern))) {
      return toCategory(rule.category);
    }
  }

  return null;
}
