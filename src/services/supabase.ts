import {
  createBrowserClient as createSupabaseBrowserClient,
  createServerClient as createSupabaseServerClient,
} from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required to create a Supabase client.`);
  }

  return value;
}

function getPublicSupabaseEnv() {
  return {
    url: getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
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
