import { redirect } from "next/navigation";

import { BillingPlans } from "@/components/BillingPlans";
import { getSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

type BillingPageProps = {
  searchParams?: Promise<{
    checkout?: string | string[];
  }>;
};

function toSearchParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function Page({ searchParams }: BillingPageProps) {
  const session = await getSessionContext();

  if (!session) {
    redirect("/");
  }

  const resolvedSearchParams = await searchParams;

  return (
    <BillingPlans
      checkoutSuccess={toSearchParam(resolvedSearchParams?.checkout) === "success"}
      entitlement={{
        state: session.entitlement.state,
        trialEndsAt: session.entitlement.trialEndsAt,
      }}
    />
  );
}
