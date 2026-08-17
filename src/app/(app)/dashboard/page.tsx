import { redirect } from "next/navigation";

import { evaluateEntitlement, type SubscriptionStatus } from "@/lib/entitlement";
import { createServerClient } from "@/services/supabase";

export const dynamic = "force-dynamic";

function parseDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function formatDate(value: Date | null): string {
  return value
    ? new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "medium",
        timeZone: "Asia/Seoul",
      }).format(value)
    : "없음";
}

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_status, trial_started_at, current_period_end")
    .eq("user_id", user.id)
    .single();

  const entitlement = evaluateEntitlement({
    subscriptionStatus:
      (profile?.subscription_status as SubscriptionStatus | undefined) ??
      "trialing",
    trialStartedAt: parseDate(profile?.trial_started_at),
    currentPeriodEnd: parseDate(profile?.current_period_end),
    now: new Date(),
  });

  return (
    <main>
      <h1>대시보드</h1>
      <p>로그인: {user.email ?? user.id}</p>
      <p>권한 상태: {entitlement.state}</p>
      <p>체험 종료일: {formatDate(entitlement.trialEndsAt)}</p>
    </main>
  );
}
