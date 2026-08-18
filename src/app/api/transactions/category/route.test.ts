import { afterEach, describe, expect, it, vi } from "vitest";

const createServerClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/supabase", () => ({
  createServerClient: createServerClientMock,
}));

function jsonRequest(body: unknown): Request {
  return new Request("https://finsight.test/api/transactions/category", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createSupabaseMock(input?: {
  profile?: {
    subscription_status: "trialing" | "active" | "canceled";
    trial_started_at: string | null;
    current_period_end: string | null;
  };
}) {
  const touchedTables: string[] = [];
  const upsert = vi.fn((row: Record<string, unknown>) => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({
        data: {
          merchant_normalized: row.merchant_normalized,
          category: row.category,
        },
        error: null,
      }),
    })),
  }));
  const profileSingle = vi.fn().mockResolvedValue({
    data:
      input?.profile ?? {
        subscription_status: "active",
        trial_started_at: "2026-08-17T00:00:00.000Z",
        current_period_end: null,
      },
    error: null,
  });
  const from = vi.fn((table: string) => {
    touchedTables.push(table);

    if (table === "profiles") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: profileSingle,
          })),
        })),
      };
    }

    if (table === "user_category_overrides") {
      return { upsert };
    }

    return {};
  });

  createServerClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
    from,
  });

  return { touchedTables, upsert };
}

describe("POST /api/transactions/category", () => {
  afterEach(() => {
    vi.resetModules();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("rejects expired users before writing category overrides", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T00:00:00.000Z"));
    const supabase = createSupabaseMock({
      profile: {
        subscription_status: "trialing",
        trial_started_at: "2026-08-01T00:00:00.000Z",
        current_period_end: null,
      },
    });
    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest({
        merchantNormalized: "스타벅스",
        category: "카페/간식",
      }),
    );

    expect(response.status).toBe(403);
    expect(supabase.upsert).not.toHaveBeenCalled();
  });

  it("rejects categories outside the fixed enum", async () => {
    const supabase = createSupabaseMock();
    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest({
        merchantNormalized: "스타벅스",
        category: "구독",
      }),
    );

    expect(response.status).toBe(400);
    expect(supabase.upsert).not.toHaveBeenCalled();
  });

  it("upserts only user_category_overrides for the normalized merchant", async () => {
    const supabase = createSupabaseMock();
    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest({
        merchantNormalized: "스타벅스",
        category: "카페/간식",
      }),
    );
    const body = (await response.json()) as {
      merchantNormalized: string;
      category: string;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      merchantNormalized: "스타벅스",
      category: "카페/간식",
    });
    expect(supabase.upsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        merchant_normalized: "스타벅스",
        category: "카페/간식",
      },
      { onConflict: "user_id,merchant_normalized" },
    );
    expect(supabase.touchedTables).toContain("user_category_overrides");
    expect(supabase.touchedTables).not.toContain("merchant_categories");
  });
});
