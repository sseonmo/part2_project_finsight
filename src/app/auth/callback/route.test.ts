import { afterEach, describe, expect, it, vi } from "vitest";

const createServerClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/supabase", () => ({
  createServerClient: createServerClientMock,
}));

describe("GET /auth/callback", () => {
  afterEach(() => {
    vi.resetModules();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  function mockSupabase({
    exchangeError = null,
    user = { id: "user-1", email: "user@example.com" },
    profileError = null,
  }: {
    exchangeError?: { message: string } | null;
    user?: { id: string; email?: string } | null;
    profileError?: { message: string } | null;
  } = {}) {
    const exchangeCodeForSession = vi
      .fn()
      .mockResolvedValue({ data: {}, error: exchangeError });
    const getUser = vi.fn().mockResolvedValue({ data: { user }, error: null });
    const upsert = vi.fn().mockResolvedValue({ data: null, error: profileError });
    const from = vi.fn(() => ({ upsert }));

    createServerClientMock.mockResolvedValue({
      auth: {
        exchangeCodeForSession,
        getUser,
      },
      from,
    });

    return {
      exchangeCodeForSession,
      getUser,
      from,
      upsert,
    };
  }

  it("exchanges the code, creates the first profile, and returns to the original path", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T01:02:03.000Z"));
    const supabase = mockSupabase();
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "https://finsight.test/auth/callback?code=abc&redirectTo=%2Fdashboard%2Ftransactions%3Fcategory%3Dfood",
      ),
    );

    expect(supabase.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(supabase.from).toHaveBeenCalledWith("profiles");
    expect(supabase.upsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        subscription_status: "trialing",
        trial_started_at: "2026-08-17T01:02:03.000Z",
      },
      {
        onConflict: "user_id",
        ignoreDuplicates: true,
      },
    );
    expect(response.headers.get("location")).toBe(
      "https://finsight.test/dashboard/transactions?category=food",
    );
  });

  it("falls back to dashboard when redirectTo is missing", async () => {
    mockSupabase();
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://finsight.test/auth/callback?code=abc"),
    );

    expect(response.headers.get("location")).toBe(
      "https://finsight.test/dashboard",
    );
  });

  it.each([
    "https://evil.test",
    "//evil.test",
    // WHATWG URL 파서는 http(s) 에서 역슬래시를 슬래시로 정규화한다.
    "/\\evil.test",
    "/\\/evil.test",
    "\\\\evil.test",
  ])(
    "rejects unsafe redirectTo values: %s",
    async (redirectTo) => {
      mockSupabase();
      const { GET } = await import("./route");

      const response = await GET(
        new Request(
          `https://finsight.test/auth/callback?code=abc&redirectTo=${encodeURIComponent(
            redirectTo,
          )}`,
        ),
      );

      expect(response.headers.get("location")).toBe(
        "https://finsight.test/dashboard",
      );
    },
  );

  it("returns to landing with a readable error when code exchange fails", async () => {
    const supabase = mockSupabase({
      exchangeError: { message: "invalid code" },
    });
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://finsight.test/auth/callback?code=bad"),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.pathname).toBe("/");
    expect(location.searchParams.get("authError")).toContain("로그인");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns to landing with a readable error when the code is missing", async () => {
    mockSupabase();
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://finsight.test/auth/callback"),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.pathname).toBe("/");
    expect(location.searchParams.get("authError")).toContain("로그인");
  });
});
