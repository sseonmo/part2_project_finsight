import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/types/database";

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required to create a Supabase client.`);
  }

  return value;
}

function isProtectedAppPath(pathname: string): boolean {
  return (
    pathname === "/settings" ||
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/")
  );
}

function withRedirectToLanding(request: NextRequest): NextResponse {
  const redirectUrl = new URL("/", request.url);
  redirectUrl.searchParams.set(
    "redirectTo",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );

  return NextResponse.redirect(redirectUrl);
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const supabase = createServerClient<Database>(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (request.nextUrl.pathname === "/" && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isProtectedAppPath(request.nextUrl.pathname) && !user) {
    return withRedirectToLanding(request);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
