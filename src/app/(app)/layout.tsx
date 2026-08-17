import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { PathAwareAppHeader, type TransactionMonthOption } from "@/components/AppHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { ReadOnlyBanner } from "@/components/ReadOnlyBanner";
import { TrialEndingBanner } from "@/components/TrialEndingBanner";
import { getSessionContext } from "@/lib/session";
import { createServerClient } from "@/services/supabase";

export const dynamic = "force-dynamic";

type AppLayoutProps = Readonly<{
  children: ReactNode;
}>;

function toYearMonth(period: string): string {
  return period.slice(0, 7);
}

async function getTransactionMonths(
  userId: string,
): Promise<TransactionMonthOption[]> {
  const supabase = await createServerClient();
  const { data } = await supabase.rpc("get_transaction_months", {
    p_user_id: userId,
  });

  return (data ?? []).map((row) => ({
    period: row.period,
    transactionCount: Number(row.transaction_count),
    yearMonth: toYearMonth(row.period),
  }));
}

export default async function AppLayout({ children }: AppLayoutProps) {
  const session = await getSessionContext();

  if (!session) {
    redirect("/");
  }

  const months = await getTransactionMonths(session.userId);

  return (
    <div className="app-shell">
      <AppSidebar
        email={session.email}
        latestYearMonth={months[0]?.yearMonth ?? null}
      />
      <div className="app-shell__content">
        <PathAwareAppHeader
          entitlement={{ canWrite: session.entitlement.canWrite }}
          months={months}
        />
        {session.entitlement.state === "expired" ? <ReadOnlyBanner /> : null}
        <TrialEndingBanner entitlement={session.entitlement} />
        <main className="app-shell__main">
          <div className="app-shell__main-inner">{children}</div>
        </main>
      </div>
    </div>
  );
}
