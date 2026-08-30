import { NextResponse } from "next/server";

import { createServerClient } from "@/services/supabase";

// GET 이 아니라 POST 다. 링크 프리페치나 <img> 태그만으로 남의 세션을 끊을 수 없게 한다.
export async function POST(): Promise<NextResponse> {
  const supabase = await createServerClient();

  const { error } = await supabase.auth.signOut();

  if (error) {
    return NextResponse.json(
      { error: "로그아웃하지 못했습니다." },
      { status: 500 },
    );
  }

  return NextResponse.json({ redirectTo: "/" });
}
