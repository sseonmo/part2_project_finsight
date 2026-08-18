import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { AccountSettings } from "@/components/AccountSettings";
import {
  summarizeSubscription,
  type SubscriptionStatus,
} from "@/lib/entitlement";
import { getSessionContext } from "@/lib/session";
import { createServerClient } from "@/services/supabase";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type CountableTable =
  | "monthly_reports"
  | "spending_signals"
  | "transactions"
  | "upload_jobs";

type ProfileSettingsFields = {
  current_period_end: string | null;
  polar_customer_id: string | null;
  subscription_status: SubscriptionStatus;
  trial_started_at: string | null;
};

function parseDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

async function countRows(
  supabase: SupabaseClient<Database>,
  table: CountableTable,
  userId: string,
): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  return count ?? 0;
}

export default async function Page() {
  const session = await getSessionContext();

  if (!session) {
    redirect("/");
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "subscription_status, trial_started_at, current_period_end, polar_customer_id",
    )
    .eq("user_id", session.userId)
    .single<ProfileSettingsFields>();

  const [reports, signals, transactions, uploads] = await Promise.all([
    countRows(supabase, "monthly_reports", session.userId),
    countRows(supabase, "spending_signals", session.userId),
    countRows(supabase, "transactions", session.userId),
    countRows(supabase, "upload_jobs", session.userId),
  ]);

  // 상태 문자열 비교는 entitlement.ts 안에서만 일어난다.
  const subscription = summarizeSubscription({
    currentPeriodEnd: parseDate(profile?.current_period_end),
    now: new Date(),
    subscriptionStatus: profile?.subscription_status ?? "trialing",
    trialStartedAt: parseDate(profile?.trial_started_at),
  });

  return (
    <AccountSettings
      counts={{ reports, signals, transactions, uploads }}
      email={session.email}
      entitlementState={session.entitlement.state}
      hasBillingCustomer={Boolean(profile?.polar_customer_id)}
      joinedAt={parseDate(user?.created_at)}
      subscription={subscription}
    />
  );
}
