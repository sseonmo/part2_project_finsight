import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { createServerClient } from "@/services/supabase";

export const dynamic = "force-dynamic";

type AppLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default async function AppLayout({ children }: AppLayoutProps) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  return <>{children}</>;
}
