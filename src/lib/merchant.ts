const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;
const DECORATIVE_MARKS = /[＊*]/g;
const CORPORATE_MARKERS = /주식회사|\(주\)|㈜|유한회사|\(유\)/g;
const TRAILING_SERIAL = /(?:[\s_:/.-]*\d{3,})+$/;
const TRAILING_BRANCH = /\s+[가-힣A-Z0-9-]+(?:호점|지점|점|센터|터미널|영업소)$/;
const LETTER_OR_HANGUL = /[A-Z가-힣]/;

const PG_PREFIXES = [
  /^KG\s*이니시스[\s_:/.-]*/u,
  /^KGINICIS[\s_:/.-]*/u,
  /^NHN\s*KCP[\s_:/.-]*/u,
  /^KCP[\s_:/.-]*/u,
  /^토스페이먼츠[\s_:/.-]*/u,
  /^TOSS\s*PAYMENTS[\s_:/.-]*/u,
  /^나이스페이먼츠[\s_:/.-]*/u,
  /^NICE\s*PAYMENTS[\s_:/.-]*/u,
  /^스마트로[\s_:/.-]*/u,
  /^KICC[\s_:/.-]*/u,
  /^다날[\s_:/.-]*/u,
  /^PAYCO[\s_:/.-]*/u,
  /^페이코[\s_:/.-]*/u,
] as const;

const CANONICAL_MERCHANTS: ReadonlyArray<[RegExp, string]> = [
  [/^스타벅스(?:커피)?(?:코리아)?/u, "스타벅스"],
  [/^배달의민족/u, "배달의민족"],
  [/^우아한형제들배달의민족/u, "배달의민족"],
  [/^쿠팡/u, "쿠팡"],
  [/^GS25/u, "GS25"],
  [/^(?:CU|씨유)/u, "CU"],
  [/^11번가/u, "11번가"],
  [/^카카오택시/u, "카카오택시"],
  [/^맥도날드/u, "맥도날드"],
  [/^S-OIL/u, "S-OIL"],
] as const;

function compact(value: string): string {
  return value
    .normalize("NFKC")
    .replace(CONTROL_CHARS, " ")
    .replace(DECORATIVE_MARKS, " ")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removePgPrefixes(value: string): string {
  let result = value;
  let changed = true;

  while (changed) {
    changed = false;

    for (const prefix of PG_PREFIXES) {
      const next = result.replace(prefix, "");

      if (next !== result) {
        result = next.trim();
        changed = true;
      }
    }
  }

  return result;
}

function removeTrailingSerial(value: string): string {
  const candidate = value.replace(TRAILING_SERIAL, "").trim();

  return candidate && LETTER_OR_HANGUL.test(candidate) ? candidate : value;
}

function removeTrailingBranch(value: string): string {
  const candidate = value.replace(TRAILING_BRANCH, "").trim();

  return candidate && LETTER_OR_HANGUL.test(candidate) ? candidate : value;
}

function canonicalizeKnownMerchant(value: string): string | null {
  const withoutSpaces = value.replace(/\s+/g, "");

  for (const [pattern, canonical] of CANONICAL_MERCHANTS) {
    if (pattern.test(withoutSpaces)) {
      return canonical;
    }
  }

  return null;
}

export function normalizeMerchant(raw: string): string {
  const fallback = compact(raw).toLocaleUpperCase("ko-KR");
  let normalized = fallback;

  normalized = removePgPrefixes(normalized);
  normalized = normalized.replace(CORPORATE_MARKERS, " ");
  normalized = compact(normalized).toLocaleUpperCase("ko-KR");
  normalized = removeTrailingSerial(normalized);

  const canonicalBeforeBranch = canonicalizeKnownMerchant(normalized);

  if (canonicalBeforeBranch) {
    return canonicalBeforeBranch;
  }

  normalized = removeTrailingBranch(normalized);

  const canonicalAfterBranch = canonicalizeKnownMerchant(normalized);

  if (canonicalAfterBranch) {
    return canonicalAfterBranch;
  }

  normalized = compact(normalized).toLocaleUpperCase("ko-KR");

  return normalized || fallback || raw.trim() || "UNKNOWN";
}
