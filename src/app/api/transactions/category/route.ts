import { NextResponse } from "next/server";

import { CATEGORIES, type Category } from "@/lib/categories";
import {
  evaluateEntitlement,
  type SubscriptionStatus,
} from "@/lib/entitlement";
import { createServerClient } from "@/services/supabase";

type ProfileEntitlementFields = {
  subscription_status: SubscriptionStatus;
  trial_started_at: string | null;
  current_period_end: string | null;
};

type CategoryOverrideRow = {
  merchant_normalized: string;
  category: Category;
};

const CATEGORY_SET = new Set<string>(CATEGORIES);

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCategory(value: unknown): value is Category {
  return typeof value === "string" && CATEGORY_SET.has(value);
}

function parseDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = await parseJsonBody(request);

  if (!isRecord(body)) {
    return jsonError("요청 본문이 올바르지 않습니다.", 400);
  }

  const merchantNormalized =
    typeof body.merchantNormalized === "string"
      ? body.merchantNormalized.trim()
      : "";

  if (!merchantNormalized) {
    return jsonError("가맹점 정보가 필요합니다.", 400);
  }

  if (!isCategory(body.category)) {
    return jsonError("지원하지 않는 카테고리입니다.", 400);
  }

  const supabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("로그인이 필요합니다.", 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("subscription_status, trial_started_at, current_period_end")
    .eq("user_id", user.id)
    .single<ProfileEntitlementFields>();

  if (profileError || !profile) {
    return jsonError("프로필을 확인하지 못했습니다.", 403);
  }

  const entitlement = evaluateEntitlement({
    subscriptionStatus: profile.subscription_status,
    trialStartedAt: parseDate(profile.trial_started_at),
    currentPeriodEnd: parseDate(profile.current_period_end),
    now: new Date(),
  });

  if (!entitlement.canWrite) {
    return jsonError("체험 또는 구독이 만료되어 분류를 수정할 수 없습니다.", 403);
  }

  const { data: override, error: overrideError } = await supabase
    .from("user_category_overrides")
    .upsert(
      {
        user_id: user.id,
        merchant_normalized: merchantNormalized,
        category: body.category,
      },
      { onConflict: "user_id,merchant_normalized" },
    )
    .select("merchant_normalized, category")
    .single<CategoryOverrideRow>();

  if (overrideError || !override) {
    return jsonError("분류를 저장하지 못했습니다.", 500);
  }

  return NextResponse.json({
    merchantNormalized: override.merchant_normalized,
    category: override.category,
  });
}
