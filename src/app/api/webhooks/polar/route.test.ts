import { afterEach, describe, expect, it, vi } from "vitest";

const verifyPolarWebhookMock = vi.hoisted(() => vi.fn());
const createServiceRoleClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/polar", () => ({
  verifyPolarWebhook: verifyPolarWebhookMock,
}));

vi.mock("@/services/supabase-service-role", () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}));

type SubscriptionOverrides = {
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: Date;
  endedAt?: Date | null;
  endsAt?: Date | null;
  metadata?: Record<string, unknown>;
};

const PERIOD_END = new Date("2026-09-18T00:00:00.000Z");

function subscriptionEvent(
  type: string,
  overrides: SubscriptionOverrides = {},
): unknown {
  return {
    type,
    data: {
      id: "sub_1",
      customerId: "cus_1",
      cancelAtPeriodEnd: overrides.cancelAtPeriodEnd ?? false,
      currentPeriodEnd: overrides.currentPeriodEnd ?? PERIOD_END,
      endedAt: overrides.endedAt ?? null,
      endsAt: overrides.endsAt ?? null,
      metadata:
        overrides.metadata === undefined
          ? { user_id: "user-1" }
          : overrides.metadata,
      status: "active",
    },
  };
}

function createSupabaseMock(
  options: {
    insertError?: { code?: string } | null;
    updatedRows?: Array<{ user_id: string }> | null;
    updateError?: { message: string } | null;
  } = {},
) {
  const insert = vi.fn().mockResolvedValue({
    error: options.insertError ?? null,
  });
  const deleteEq = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn(() => ({ eq: deleteEq }));
  const updateEq = vi.fn(() => ({
    select: vi.fn().mockResolvedValue({
      data:
        options.updatedRows === undefined
          ? [{ user_id: "user-1" }]
          : options.updatedRows,
      error: options.updateError ?? null,
    }),
  }));
  const update = vi.fn(() => ({ eq: updateEq }));

  const from = vi.fn((table: string) => {
    if (table === "processed_webhook_events") {
      return { insert, delete: remove };
    }

    return { update };
  });

  createServiceRoleClientMock.mockReturnValue({ from });

  return { deleteEq, from, insert, remove, update, updateEq };
}

function webhookRequest(body: string = JSON.stringify({ type: "x" })): {
  request: Request;
  json: ReturnType<typeof vi.fn>;
} {
  const request = new Request("https://finsight.test/api/webhooks/polar", {
    method: "POST",
    body,
    headers: {
      "webhook-id": "evt_1",
      "webhook-timestamp": "1786000000",
      "webhook-signature": "v1,signature",
    },
  });
  const json = vi.fn();

  Object.defineProperty(request, "json", { value: json });

  return { request, json };
}

describe("POST /api/webhooks/polar", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects requests whose signature does not verify without parsing the body", async () => {
    verifyPolarWebhookMock.mockReturnValue({ status: "invalid_signature" });
    const { POST } = await import("./route");
    const { request, json } = webhookRequest();

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(json).not.toHaveBeenCalled();
    expect(createServiceRoleClientMock).not.toHaveBeenCalled();
  });

  it("verifies the raw request body, not a re-serialized payload", async () => {
    const raw = '{"type":"subscription.active","spacing":  1}';
    verifyPolarWebhookMock.mockReturnValue({ status: "invalid_signature" });
    const { POST } = await import("./route");
    const { request } = webhookRequest(raw);

    await POST(request);

    expect(verifyPolarWebhookMock).toHaveBeenCalledWith({
      rawBody: raw,
      headers: expect.objectContaining({ "webhook-id": "evt_1" }),
    });
  });

  it("activates the subscription on subscription.active", async () => {
    const supabase = createSupabaseMock();
    verifyPolarWebhookMock.mockReturnValue({
      status: "verified",
      event: subscriptionEvent("subscription.active"),
    });
    const { POST } = await import("./route");

    const response = await POST(webhookRequest().request);

    expect(response.status).toBe(200);
    expect(supabase.insert).toHaveBeenCalledWith({
      event_id: "evt_1",
      event_type: "subscription.active",
    });
    expect(supabase.update).toHaveBeenCalledWith({
      subscription_status: "active",
      current_period_end: PERIOD_END.toISOString(),
      polar_customer_id: "cus_1",
    });
    expect(supabase.updateEq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("keeps current_period_end when a subscription is canceled", async () => {
    const supabase = createSupabaseMock();
    verifyPolarWebhookMock.mockReturnValue({
      status: "verified",
      event: subscriptionEvent("subscription.canceled", {
        cancelAtPeriodEnd: true,
      }),
    });
    const { POST } = await import("./route");

    await POST(webhookRequest().request);

    expect(supabase.update).toHaveBeenCalledWith({
      subscription_status: "canceled",
      current_period_end: PERIOD_END.toISOString(),
      polar_customer_id: "cus_1",
    });
  });

  it("uses the end timestamp when a subscription is revoked", async () => {
    const endedAt = new Date("2026-08-20T00:00:00.000Z");
    const supabase = createSupabaseMock();
    verifyPolarWebhookMock.mockReturnValue({
      status: "verified",
      event: subscriptionEvent("subscription.revoked", { endedAt }),
    });
    const { POST } = await import("./route");

    await POST(webhookRequest().request);

    expect(supabase.update).toHaveBeenCalledWith({
      subscription_status: "canceled",
      current_period_end: endedAt.toISOString(),
      polar_customer_id: "cus_1",
    });
  });

  it("restores active access when a cancellation is undone", async () => {
    const supabase = createSupabaseMock();
    verifyPolarWebhookMock.mockReturnValue({
      status: "verified",
      event: subscriptionEvent("subscription.uncanceled"),
    });
    const { POST } = await import("./route");

    await POST(webhookRequest().request);

    expect(supabase.update).toHaveBeenCalledWith({
      subscription_status: "active",
      current_period_end: PERIOD_END.toISOString(),
      polar_customer_id: "cus_1",
    });
  });

  it("treats subscription.updated with a pending cancellation as canceled", async () => {
    const supabase = createSupabaseMock();
    verifyPolarWebhookMock.mockReturnValue({
      status: "verified",
      event: subscriptionEvent("subscription.updated", {
        cancelAtPeriodEnd: true,
      }),
    });
    const { POST } = await import("./route");

    await POST(webhookRequest().request);

    expect(supabase.update).toHaveBeenCalledWith({
      subscription_status: "canceled",
      current_period_end: PERIOD_END.toISOString(),
      polar_customer_id: "cus_1",
    });
  });

  it("never writes the calculated expired state or touches trial_started_at", async () => {
    const supabase = createSupabaseMock();
    verifyPolarWebhookMock.mockReturnValue({
      status: "verified",
      event: subscriptionEvent("subscription.revoked", {
        endedAt: new Date("2026-08-20T00:00:00.000Z"),
      }),
    });
    const { POST } = await import("./route");

    await POST(webhookRequest().request);

    const patch = supabase.update.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(patch.subscription_status).not.toBe("expired");
    expect(patch).not.toHaveProperty("trial_started_at");
  });

  it("ignores a replayed event id without updating profiles", async () => {
    const supabase = createSupabaseMock({ insertError: { code: "23505" } });
    verifyPolarWebhookMock.mockReturnValue({
      status: "verified",
      event: subscriptionEvent("subscription.active"),
    });
    const { POST } = await import("./route");

    const response = await POST(webhookRequest().request);

    expect(response.status).toBe(200);
    expect(supabase.insert).toHaveBeenCalledTimes(1);
    expect(supabase.update).not.toHaveBeenCalled();
  });

  it("rejects events without a user_id in metadata and leaves profiles alone", async () => {
    const supabase = createSupabaseMock();
    verifyPolarWebhookMock.mockReturnValue({
      status: "verified",
      event: subscriptionEvent("subscription.active", { metadata: {} }),
    });
    const { POST } = await import("./route");

    const response = await POST(webhookRequest().request);

    expect(response.status).toBe(400);
    expect(supabase.update).not.toHaveBeenCalled();
    expect(supabase.deleteEq).toHaveBeenCalledWith("event_id", "evt_1");
  });

  it("removes the event row when the profile update fails", async () => {
    const supabase = createSupabaseMock({
      updateError: { message: "boom" },
      updatedRows: null,
    });
    verifyPolarWebhookMock.mockReturnValue({
      status: "verified",
      event: subscriptionEvent("subscription.active"),
    });
    const { POST } = await import("./route");

    const response = await POST(webhookRequest().request);

    expect(response.status).toBe(500);
    expect(supabase.remove).toHaveBeenCalled();
    expect(supabase.deleteEq).toHaveBeenCalledWith("event_id", "evt_1");
  });

  it("answers 200 for event types it does not handle", async () => {
    const supabase = createSupabaseMock();
    verifyPolarWebhookMock.mockReturnValue({
      status: "verified",
      event: subscriptionEvent("order.created"),
    });
    const { POST } = await import("./route");

    const response = await POST(webhookRequest().request);

    expect(response.status).toBe(200);
    expect(supabase.insert).not.toHaveBeenCalled();
    expect(supabase.update).not.toHaveBeenCalled();
  });

  it("answers 200 for payloads the SDK cannot recognise", async () => {
    verifyPolarWebhookMock.mockReturnValue({ status: "unsupported" });
    const { POST } = await import("./route");

    const response = await POST(webhookRequest().request);

    expect(response.status).toBe(200);
    expect(createServiceRoleClientMock).not.toHaveBeenCalled();
  });
});
