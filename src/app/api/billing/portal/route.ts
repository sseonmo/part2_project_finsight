import { NextResponse } from "next/server";

import { getSessionContext } from "@/lib/session";
import { createCustomerPortalSession } from "@/services/polar";
import { createServerClient } from "@/services/supabase";

type ProfilePortalFields = {
  polar_customer_id: string | null;
};

export async function POST() {
  const session = await getSessionContext();

  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const supabase = await createServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("polar_customer_id")
    .eq("user_id", session.userId)
    .single<ProfilePortalFields>();

  // 해지·결제수단 변경은 Polar 포털에서 일어나고, 그 결과는 웹훅으로만 돌아온다.
  // 여기서 subscription_status 를 직접 바꾸면 서명 검증을 우회하는 경로가 생긴다.
  if (!profile?.polar_customer_id) {
    return NextResponse.json(
      {
        error: "아직 결제한 적이 없어 관리할 구독이 없습니다.",
        redirectTo: "/dashboard/billing",
      },
      { status: 409 },
    );
  }

  const portal = await createCustomerPortalSession({
    polarCustomerId: profile.polar_customer_id,
  });

  return NextResponse.json(portal);
}
