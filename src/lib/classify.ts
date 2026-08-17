import type { Category } from "./categories";
import { matchSeedRule } from "./merchant-rules";

export type ResolveInput = {
  normalized: string[];
  overrides: Record<string, Category>;
  cache: Record<string, Category>;
};

export type ResolveResult = {
  resolved: Record<string, Category>;
  unmatched: string[];
};

export function resolveCategories(input: ResolveInput): ResolveResult {
  const resolved: Record<string, Category> = {};
  const unmatched: string[] = [];
  const seen = new Set<string>();

  for (const merchant of input.normalized) {
    if (seen.has(merchant)) {
      continue;
    }

    seen.add(merchant);

    const override = input.overrides[merchant];

    if (override) {
      resolved[merchant] = override;
      continue;
    }

    const cached = input.cache[merchant];

    if (cached) {
      resolved[merchant] = cached;
      continue;
    }

    const seeded = matchSeedRule(merchant);

    if (seeded) {
      resolved[merchant] = seeded;
      continue;
    }

    unmatched.push(merchant);
  }

  return { resolved, unmatched };
}
