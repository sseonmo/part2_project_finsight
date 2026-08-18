import { NextResponse } from "next/server";

import type { SubscriptionStatus } from "@/lib/entitlement";
import { verifyPolarWebhook, type PolarWebhookEvent } from "@/services/polar";
import { createServiceRoleClient } from "@/services/supabase-service-role";

export const runtime = "nodejs";

const UNIQUE_VIOLATION = "23505";

type BillingState = {
  subscriptionStatus: Extract<SubscriptionStatus, "active" | "canceled">;
  currentPeriodEnd: Date;
  polarCustomerId: string;
  userId: string | null;
};

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function ignored(type: string): NextResponse {
  console.info(`[polar-webhook] 처리하지 않는 이벤트: ${type}`);

  return NextResponse.json({ status: "ignored" });
}

function readUserId(metadata: Record<string, unknown>): string | null {
  const userId = metadata.user_id;

  return typeof userId === "string" && userId.length > 0 ? userId : null;
}

/**
 * 결제 사실만 옮겨 적는다. `expired` 는 저장되는 상태가 아니라
 * `entitlement.ts` 가 매 요청 계산하는 결과다.
 */
function resolveBillingState(event: PolarWebhookEvent): BillingState | null {
  switch (event.type) {
    case "subscription.created":
    case "subscription.active":
    case "subscription.uncanceled":
      return {
        subscriptionStatus: "active",
        currentPeriodEnd: event.data.currentPeriodEnd,
        polarCustomerId: event.data.customerId,
        userId: readUserId(event.data.metadata),
      };
    case "subscription.canceled":
      // 해지 예약이다. 결제한 기간은 그대로 남긴다.
      return {
        subscriptionStatus: "canceled",
        currentPeriodEnd: event.data.currentPeriodEnd,
        polarCustomerId: event.data.customerId,
        userId: readUserId(event.data.metadata),
      };
    case "subscription.revoked":
      return {
        subscriptionStatus: "canceled",
        currentPeriodEnd:
          event.data.endedAt ?? event.data.endsAt ?? event.data.currentPeriodEnd,
        polarCustomerId: event.data.customerId,
        userId: readUserId(event.data.metadata),
      };
    case "subscription.updated":
      // 갱신·해지·해지취소가 모두 이 이벤트로도 온다.
      // 해지 이벤트와 도착 순서가 뒤집혀도 권한이 되살아나지 않도록
      // 상태는 이벤트 종류가 아니라 구독 자신이 알려주는 값으로 정한다.
      return {
        subscriptionStatus:
          event.data.cancelAtPeriodEnd || event.data.endedAt
            ? "canceled"
            : "active",
        currentPeriodEnd: event.data.endedAt ?? event.data.currentPeriodEnd,
        polarCustomerId: event.data.customerId,
        userId: readUserId(event.data.metadata),
      };
    default:
      return null;
  }
}

export async function POST(request: Request) {
  // 서명은 바이트 그대로에 대해 계산된다. 파싱·재직렬화를 거치면 검증이 깨진다.
  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers);

  const verification = verifyPolarWebhook({ headers, rawBody });

  if (verification.status === "invalid_signature") {
    return jsonError("서명을 확인하지 못했습니다.", 401);
  }

  if (verification.status === "unsupported") {
    return ignored("unsupported");
  }

  const event = verification.event;
  const state = resolveBillingState(event);

  if (!state) {
    return ignored(event.type);
  }

  const eventId = headers["webhook-id"];

  if (!eventId) {
    return jsonError("이벤트 ID가 없습니다.", 400);
  }

  const supabase = createServiceRoleClient();

  // 조회 후 삽입이 아니라 삽입 충돌로 판정한다.
  // 같은 이벤트가 동시에 두 번 도착하면 조회는 둘 다 "없음"을 본다.
  const { error: insertError } = await supabase
    .from("processed_webhook_events")
    .insert({ event_id: eventId, event_type: event.type });

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) {
      return NextResponse.json({ status: "duplicate" });
    }

    return jsonError("웹훅을 기록하지 못했습니다.", 500);
  }

  // 여기서부터 실패하면 재전송이 다시 처리될 수 있도록 방금 넣은 표시를 지운다.
  const forget = async () => {
    await supabase
      .from("processed_webhook_events")
      .delete()
      .eq("event_id", eventId);
  };

  if (!state.userId) {
    await forget();

    return jsonError("이벤트에 user_id가 없습니다.", 400);
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({
      subscription_status: state.subscriptionStatus,
      current_period_end: state.currentPeriodEnd.toISOString(),
      polar_customer_id: state.polarCustomerId,
    })
    .eq("user_id", state.userId)
    .select("user_id");

  if (error || !data || data.length === 0) {
    await forget();

    return jsonError("구독 상태를 반영하지 못했습니다.", 500);
  }

  return NextResponse.json({ status: "processed" });
}
