import { NextResponse } from "next/server";

import { inngest } from "@/inngest/client";
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

  const { data: job, error: jobError } = await supabase
    .from("upload_jobs")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (jobError || !job) {
    return jsonError("업로드 작업을 찾을 수 없습니다.", 404);
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
    return jsonError("체험 또는 구독이 만료되어 업로드할 수 없습니다.", 403);
  }

  if (job.status !== "pending") {
    return jsonError("이미 처리 중이거나 완료된 업로드입니다.", 409);
  }

  const { data: claimed, error: claimError } = await supabase
    .from("upload_jobs")
    .update({ status: "parsing", failed_reason: null })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .single();

  if (claimError || !claimed) {
    return jsonError("업로드 작업을 시작하지 못했습니다.", 409);
  }

  try {
    await inngest.send({
      name: "csv.upload_requested",
      data: { uploadId: id, userId: user.id },
    });
  } catch {
    await supabase
      .from("upload_jobs")
      .update({
        status: "failed",
        failed_reason: "업로드 처리를 시작하지 못했습니다.",
      })
      .eq("id", id)
      .eq("user_id", user.id);

    return jsonError("업로드 처리를 시작하지 못했습니다.", 500);
  }

  return NextResponse.json({ id, status: "parsing" }, { status: 202 });
}
