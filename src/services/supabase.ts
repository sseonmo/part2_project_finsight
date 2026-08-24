import {
  createBrowserClient as createSupabaseBrowserClient,
  createServerClient as createSupabaseServerClient,
} from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is required to create a Supabase client.`);
  }

  return value;
}

// 키를 리터럴로 적는다. 번들러는 리터럴 process.env.NEXT_PUBLIC_X 만 값으로
// 치환하므로, 동적으로 읽으면 브라우저에서 빈 폴리필 객체를 보게 되어 로그인과
// 업로드가 통째로 막힌다.
function getPublicSupabaseEnv() {
  return {
    url: requireEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    anonKey: requireEnv(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  };
}

export function createBrowserClient(): SupabaseClient<Database> {
  const { url, anonKey } = getPublicSupabaseEnv();

  return createSupabaseBrowserClient<Database>(url, anonKey);
}

export async function createServerClient(): Promise<SupabaseClient<Database>> {
  const { url, anonKey } = getPublicSupabaseEnv();
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();

  return createSupabaseServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components can read sessions but cannot always write cookies.
        }
      },
    },
  });
}
