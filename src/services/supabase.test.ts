import { afterEach, describe, expect, it, vi } from "vitest";

const createBrowserClientMock = vi.hoisted(() => vi.fn());
const createSsrServerClientMock = vi.hoisted(() => vi.fn());
const createSupabaseClientMock = vi.hoisted(() => vi.fn());
const cookiesMock = vi.hoisted(() => vi.fn());

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: createBrowserClientMock,
  createServerClient: createSsrServerClientMock,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createSupabaseClientMock,
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("server-only", () => ({}));

describe("Supabase client factories", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("reads public env through literal keys so the client bundle inlines them", async () => {
    // 번들러는 리터럴 process.env.NEXT_PUBLIC_X 만 치환한다. process.env[name]
    // 처럼 동적으로 읽으면 브라우저에서는 빈 폴리필 객체를 읽게 되어 값이 항상
    // undefined 가 되고, 로그인과 업로드가 통째로 막힌다. 런타임 동작은 Node 의
    // 진짜 process.env 위에서 늘 통과하므로 소스에서 직접 막는다.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/services/supabase.ts", "utf8");

    expect(source).toContain("process.env.NEXT_PUBLIC_SUPABASE_URL");
    expect(source).toContain("process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(source).not.toMatch(/process\.env\[/);
  });

  it("does not require environment variables at module import time", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    await expect(import("./supabase")).resolves.toBeDefined();
  });

  it("creates a browser client with the public Supabase env", async () => {
    const client = { kind: "browser-client" };
    createBrowserClientMock.mockReturnValue(client);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    const { createBrowserClient } = await import("./supabase");

    expect(createBrowserClient()).toBe(client);
    expect(createBrowserClientMock).toHaveBeenCalledWith(
      "https://supabase.test",
      "anon-key",
    );
  });

  it("throws a clear call-time error when public env is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    const { createBrowserClient } = await import("./supabase");

    expect(() => createBrowserClient()).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL is required/,
    );
  });

  it("creates a server client from Next cookies", async () => {
    const client = { kind: "server-client" };
    const cookieStore = {
      getAll: vi.fn(() => [{ name: "sb-access-token", value: "token" }]),
      set: vi.fn(),
    };
    createSsrServerClientMock.mockReturnValue(client);
    cookiesMock.mockResolvedValue(cookieStore);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    const { createServerClient } = await import("./supabase");

    await expect(createServerClient()).resolves.toBe(client);
    const options = createSsrServerClientMock.mock.calls[0]?.[2];

    expect(options.cookies.getAll()).toEqual([
      { name: "sb-access-token", value: "token" },
    ]);

    options.cookies.setAll([
      { name: "sb-refresh-token", value: "refresh", options: { path: "/" } },
    ]);

    expect(cookieStore.set).toHaveBeenCalledWith("sb-refresh-token", "refresh", {
      path: "/",
    });
  });

  it("keeps the service role client in a server-only module", async () => {
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
