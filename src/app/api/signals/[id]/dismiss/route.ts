import { NextResponse } from "next/server";

import {
  evaluateEntitlement,
  type SubscriptionStatus,
} from "@/lib/entitlement";
import { createServerClient } from "@/services/supabase";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ProfileEntitlementFields = {
  subscription_status: SubscriptionStatus;
  trial_started_at: string | null;
  current_period_end: string | null;
};

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("로그인이 필요합니다.", 401);
  }

  const { data: signal, error: signalError } = await supabase
    .from("spending_signals")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (signalError || !signal) {
    return jsonError("이 신호를 찾을 수 없습니다.", 404);
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
    trialStartedAt: profile.trial_started_at
      ? new Date(profile.trial_started_at)
      : null,
    currentPeriodEnd: profile.current_period_end
      ? new Date(profile.current_period_end)
      : null,
    now: new Date(),
  });

  if (!entitlement.canWrite) {
    return jsonError("체험 또는 구독이 만료되어 신호를 숨길 수 없습니다.", 403);
  }

  const dismissedAt = new Date().toISOString();
  const { data: dismissed, error: dismissError } = await supabase
    .from("spending_signals")
    .update({ dismissed_at: dismissedAt })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .single();

  if (dismissError || !dismissed) {
    return jsonError("신호를 숨기지 못했습니다.", 500);
  }

  return NextResponse.json({ id, dismissedAt });
}
