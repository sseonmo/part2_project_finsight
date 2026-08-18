import { NextResponse } from "next/server";

import {
  fetchDashboardCategoryBreakdown,
  fetchDashboardSummary,
  fetchDashboardTopMerchants,
} from "@/lib/dashboard/queries";
import {
  evaluateEntitlement,
  type SubscriptionStatus,
} from "@/lib/entitlement";
import type { SignalType } from "@/lib/signals";
import { describeMonthlyReport } from "@/services/openai";
import { createServerClient } from "@/services/supabase";
import type { Database, Json } from "@/types/database";

type RouteContext = {
  params: Promise<{ yearMonth: string }>;
};

type ProfileEntitlementFields = {
  subscription_status: SubscriptionStatus;
  trial_started_at: string | null;
  current_period_end: string | null;
};

type SignalRow = Pick<
  Database["public"]["Tables"]["spending_signals"]["Row"],
  "impact" | "payload" | "type"
>;

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function isValidYearMonth(value: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return false;
  }

  const month = Number(value.slice(5, 7));

  return month >= 1 && month <= 12;
}

function toPeriod(yearMonth: string): string {
  return `${yearMonth}-01`;
}

function previousPeriod(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;

  return `${previousYear}-${String(previousMonth).padStart(2, "0")}-01`;
}

function parseDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

function payloadRecord(payload: Json): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }

  return {};
}

async function clearGenerationStartedAt(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  input: { period: string; userId: string },
): Promise<void> {
  await supabase
    .from("monthly_reports")
    .update({ generation_started_at: null })
    .eq("user_id", input.userId)
    .eq("month", input.period);
}

export async function POST(_request: Request, context: RouteContext) {
  const { yearMonth } = await context.params;

  if (!isValidYearMonth(yearMonth)) {
    return jsonError("월 형식이 올바르지 않습니다.", 404);
  }

  const period = toPeriod(yearMonth);
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
    return jsonError("체험 또는 구독이 만료되어 리포트를 만들 수 없습니다.", 403);
  }

  const { data: claimed, error: claimError } = await supabase.rpc(
    "claim_monthly_report_generation",
    {
      p_user_id: user.id,
      p_month: period,
      p_stale_after: "5 minutes",
    },
  );

  if (claimError) {
    return jsonError("리포트 생성을 시작하지 못했습니다.", 500);
  }

  if (!claimed) {
    return jsonError("이미 리포트를 생성하는 중입니다.", 409);
  }

  try {
    const [
      currentSummary,
      previousSummary,
      categoryBreakdown,
      topMerchants,
      signalsResult,
    ] = await Promise.all([
      fetchDashboardSummary(supabase, { userId: user.id, period }),
      fetchDashboardSummary(supabase, {
        userId: user.id,
        period: previousPeriod(period),
      }),
      fetchDashboardCategoryBreakdown(supabase, {
        userId: user.id,
        period,
      }),
      fetchDashboardTopMerchants(supabase, {
        userId: user.id,
        period,
        limit: 5,
      }),
      supabase
        .from("spending_signals")
        .select("type, payload, impact")
        .eq("user_id", user.id)
        .eq("period", period)
        .order("impact", { ascending: false, nullsFirst: false }),
    ]);

    if (signalsResult.error) {
      throw new Error(signalsResult.error.message);
    }

    const sections = await describeMonthlyReport({
      month: yearMonth,
      totalExpense: currentSummary.totalExpense,
      previousTotalExpense:
        previousSummary.transactionCount > 0
          ? previousSummary.totalExpense
          : null,
      transactionCount: currentSummary.transactionCount,
      categoryBreakdown: categoryBreakdown.map((item) => ({
        category: item.category,
        totalAmount: item.totalAmount,
      })),
      topMerchants: topMerchants.map((merchant) => ({
        merchantNormalized: merchant.merchantNormalized,
        totalAmount: merchant.totalAmount,
      })),
      signals: ((signalsResult.data ?? []) as SignalRow[]).map((signal) => ({
        type: signal.type as SignalType,
        payload: payloadRecord(signal.payload),
        impact: signal.impact,
      })),
    });
    const generatedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("monthly_reports")
      .update({
        narrative: JSON.stringify(sections),
        generated_at: generatedAt,
        generation_started_at: null,
      })
      .eq("user_id", user.id)
      .eq("month", period);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({
      month: yearMonth,
      generatedAt,
      sectionCount: sections.length,
    });
  } catch {
    await clearGenerationStartedAt(supabase, {
      period,
      userId: user.id,
    });

    return jsonError("리포트를 생성하지 못했습니다.", 500);
  }
}
