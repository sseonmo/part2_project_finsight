"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/Button";
import { createBrowserClient } from "@/services/supabase";

function safeRedirectPath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

function getBrowserOrigin(): string {
  return window.location.origin === "null"
    ? "http://localhost:3000"
    : window.location.origin;
}

function buildCallbackUrl(redirectTo: string | null): string {
  const callbackUrl = new URL("/auth/callback", getBrowserOrigin());
  const safeRedirectTo = safeRedirectPath(redirectTo);

  if (safeRedirectTo) {
    callbackUrl.searchParams.set("redirectTo", safeRedirectTo);
  }

  return callbackUrl.toString();
}

function MarketingContent() {
  const searchParams = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const authError = searchParams.get("authError");

  async function startGoogleOAuth() {
    setErrorMessage(null);

    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: buildCallbackUrl(searchParams.get("redirectTo")),
        },
      });

      if (error) {
        setErrorMessage("로그인을 시작하지 못했습니다. 다시 시도해 주세요.");
      }
    } catch {
      setErrorMessage("로그인을 시작하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  return (
    <main>
      <h1>finsight</h1>
      <p>
        카드 명세서 CSV를 올리면 지출을 자동 분류하고, 행동을 바꿀 수 있는
        지적 5종을 찾아 문장으로 알려준다.
      </p>
      {authError ? <p role="alert">{authError}</p> : null}
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      <Button onClick={startGoogleOAuth}>
        구글로 시작하기
      </Button>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <MarketingContent />
    </Suspense>
  );
}
