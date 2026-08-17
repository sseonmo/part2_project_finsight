import { afterEach, describe, expect, it, vi } from "vitest";

const createSupabaseClientMock = vi.hoisted(() => vi.fn());

vi.mock("@supabase/supabase-js", () => ({
  createClient: createSupabaseClientMock,
}));

vi.mock("server-only", () => ({}));

describe("createServiceRoleClient", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("creates a service role client with session persistence disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    const client = { kind: "service-role-client" };
    createSupabaseClientMock.mockReturnValue(client);

    const { createServiceRoleClient } = await import("./supabase-service-role");

    expect(createServiceRoleClient()).toBe(client);
    expect(createSupabaseClientMock).toHaveBeenCalledWith(
      "https://supabase.test",
      "service-role-key",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  });

  it("throws a clear call-time error when the service role key is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const { createServiceRoleClient } = await import("./supabase-service-role");

    expect(() => createServiceRoleClient()).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY is required/,
    );
  });
});
