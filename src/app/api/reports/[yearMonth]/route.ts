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

// 카드 명세서를 다루는 서비스라 2000년 이전 달은 실익이 없고, 미래는 다음
// 달까지만 받는다. 범위가 없으면 약 10.8만 개 월이 전부 유효해져 요청 하나가
// 그대로 LLM 호출 하나가 된다.
const MIN_YEAR_MONTH = "2000-01";

function nextYearMonth(now: Date): string {
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isValidYearMonth(value: string, now: Date): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return false;
  }

  const month = Number(value.slice(5, 7));

  if (month < 1 || month > 12) {
    return false;
  }

  // 0 을 채운 YYYY-MM 이라 사전순 비교가 곧 시간순 비교다.
  return value >= MIN_YEAR_MONTH && value <= nextYearMonth(now);
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

  if (!isValidYearMonth(yearMonth, new Date())) {
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

  // 거래가 없는 달은 서술할 것이 없다. claim 앞에서 걸러야 monthly_reports 에
  // 빈 행이 쌓이지 않고, 빈 달을 훑는 요청이 LLM 까지 가지 않는다.
  let currentSummary: Awaited<ReturnType<typeof fetchDashboardSummary>>;

  try {
    currentSummary = await fetchDashboardSummary(supabase, {
      userId: user.id,
      period,
    });
  } catch {
    return jsonError("리포트를 생성하지 못했습니다.", 500);
  }

  if (currentSummary.transactionCount === 0) {
    return jsonError("이 달에는 거래가 없어 리포트를 만들 수 없습니다.", 422);
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
    const [previousSummary, categoryBreakdown, topMerchants, signalsResult] =
      await Promise.all([
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
        // 문단이 쓴 숫자를 함께 남긴다. 이 값이 없으면 상단 통계가 문단과
        // 다른 시점을 보여주게 된다.
        total_expense: currentSummary.totalExpense,
        previous_total_expense:
          previousSummary.transactionCount > 0
            ? previousSummary.totalExpense
            : null,
        transaction_count: currentSummary.transactionCount,
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
