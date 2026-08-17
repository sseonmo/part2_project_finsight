import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.hoisted(() => vi.fn());
const createServerClientMock = vi.hoisted(() => vi.fn());

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

describe("middleware", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  async function loadMiddleware(user: { id: string } | null) {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    getUserMock.mockResolvedValue({ data: { user }, error: null });
    createServerClientMock.mockReturnValue({
      auth: {
        getUser: getUserMock,
      },
    });

    return import("./middleware");
  }

  it("redirects anonymous app routes to landing with the original path", async () => {
    const { middleware } = await loadMiddleware(null);
    const request = new NextRequest(
      "https://finsight.test/dashboard/transactions?category=food",
    );

    const response = await middleware(request);

    expect(response.headers.get("location")).toBe(
      "https://finsight.test/?redirectTo=%2Fdashboard%2Ftransactions%3Fcategory%3Dfood",
    );
  });

  it("redirects anonymous settings to landing with the original path", async () => {
    const { middleware } = await loadMiddleware(null);
    const request = new NextRequest("https://finsight.test/settings");

    const response = await middleware(request);

    expect(response.headers.get("location")).toBe(
      "https://finsight.test/?redirectTo=%2Fsettings",
    );
  });

  it("redirects authenticated landing visits to dashboard", async () => {
    const { middleware } = await loadMiddleware({ id: "user-1" });
    const request = new NextRequest("https://finsight.test/");

    const response = await middleware(request);

    expect(response.headers.get("location")).toBe(
      "https://finsight.test/dashboard",
    );
  });

  it("does not redirect authenticated app routes", async () => {
    const { middleware } = await loadMiddleware({ id: "user-1" });
    const request = new NextRequest("https://finsight.test/dashboard");

    const response = await middleware(request);

    expect(response.headers.get("location")).toBeNull();
  });

  it("matches app routes and landing but not API or static assets", async () => {
    const { config } = await loadMiddleware(null);

    expect(
      unstable_doesMiddlewareMatch({ config, url: "/dashboard" }),
    ).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: "/settings" })).toBe(
      true,
    );
    expect(unstable_doesMiddlewareMatch({ config, url: "/" })).toBe(true);
    expect(
      unstable_doesMiddlewareMatch({ config, url: "/api/inngest" }),
    ).toBe(false);
    expect(
      unstable_doesMiddlewareMatch({ config, url: "/_next/static/app.js" }),
    ).toBe(false);
    expect(unstable_doesMiddlewareMatch({ config, url: "/favicon.ico" })).toBe(
      false,
    );
  });
});
