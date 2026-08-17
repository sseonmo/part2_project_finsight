import { NextResponse } from "next/server";

import { createServerClient } from "@/services/supabase";

function safeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

function redirectToLandingWithError(request: Request, message: string) {
  const redirectUrl = new URL("/", request.url);
  redirectUrl.searchParams.set("authError", message);

  return NextResponse.redirect(redirectUrl);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return redirectToLandingWithError(
      request,
      "로그인을 완료하지 못했습니다. 다시 시도해 주세요.",
    );
  }

  const supabase = await createServerClient();
  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return redirectToLandingWithError(
      request,
      "로그인 인증을 완료하지 못했습니다. 다시 시도해 주세요.",
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return redirectToLandingWithError(
      request,
      "로그인한 사용자를 확인하지 못했습니다. 다시 시도해 주세요.",
    );
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      subscription_status: "trialing",
      trial_started_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id",
      ignoreDuplicates: true,
    },
  );

  if (profileError) {
    return redirectToLandingWithError(
      request,
      "프로필을 준비하지 못했습니다. 다시 시도해 주세요.",
    );
  }

  return NextResponse.redirect(
    new URL(
      safeRedirectPath(requestUrl.searchParams.get("redirectTo")),
      request.url,
    ),
  );
}
