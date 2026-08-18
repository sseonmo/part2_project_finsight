import { NextResponse } from "next/server";

import { getSessionContext } from "@/lib/session";
import {
  createCheckoutSession,
  type CheckoutPlan,
} from "@/services/polar";

type CheckoutRequestBody = {
  plan?: unknown;
};

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCheckoutPlan(value: unknown): value is CheckoutPlan {
  return value === "monthly" || value === "yearly";
}

async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function buildSuccessUrl(request: Request): string {
  const origin = new URL(request.url).origin;
  const successUrl = new URL("/dashboard/billing", origin);

  successUrl.searchParams.set("checkout", "success");

  return successUrl.toString();
}

export async function POST(request: Request) {
  const session = await getSessionContext();

  if (!session) {
    return jsonError("로그인이 필요합니다.", 401);
  }

  const body = (await parseJsonBody(request)) as CheckoutRequestBody;

  if (!isRecord(body) || !isCheckoutPlan(body.plan)) {
    return jsonError("요금제를 확인해 주세요.", 400);
  }

  if (session.entitlement.state === "active") {
    return jsonError("이미 이용 가능한 구독 상태입니다.", 409);
  }

  const checkout = await createCheckoutSession({
    customerEmail: session.email,
    plan: body.plan,
    successUrl: buildSuccessUrl(request),
    userId: session.userId,
  });

  return NextResponse.json(checkout);
}
