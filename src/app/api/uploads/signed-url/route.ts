import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { evaluateEntitlement } from "@/lib/entitlement";
import { createServerClient } from "@/services/supabase";

const UPLOAD_BUCKET = "transaction-csv-uploads";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
]);

type SignedUrlRequestBody = {
  filename?: unknown;
  contentType?: unknown;
  size?: unknown;
  cardLabel?: unknown;
};

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function isAllowedContentType(contentType: string): boolean {
  return ALLOWED_CONTENT_TYPES.has(contentType.toLocaleLowerCase("en-US"));
}

function parseBody(body: SignedUrlRequestBody):
  | {
      originalFilename: string;
      contentType: string;
      size: number;
      cardLabel: string;
    }
  | { error: string } {
  const originalFilename =
    typeof body.filename === "string" && body.filename.trim()
      ? body.filename.trim()
      : "";
  const contentType =
    typeof body.contentType === "string" ? body.contentType.trim() : "";
  const size = typeof body.size === "number" ? body.size : Number.NaN;
  const cardLabel =
    typeof body.cardLabel === "string" ? body.cardLabel.trim() : "";

  if (!originalFilename) {
    return { error: "파일명이 필요합니다." };
  }

  if (!cardLabel) {
    return { error: "카드 이름을 입력해 주세요." };
  }

  if (!Number.isInteger(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
    return { error: "CSV 파일 크기를 확인해 주세요." };
  }

  if (!isAllowedContentType(contentType)) {
    return { error: "CSV 파일만 올릴 수 있습니다." };
  }

  return { originalFilename, contentType, size, cardLabel };
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("로그인이 필요합니다.", 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("subscription_status, trial_started_at, current_period_end")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile) {
    return jsonError("프로필을 확인하지 못했습니다.", 403);
  }

  const entitlement = evaluateEntitlement({
    subscriptionStatus: profile.subscription_status,
    trialStartedAt: profile.trial_started_at
      ? new Date(profile.trial_started_at)
      : null,
    currentPeriodEnd: profile.current_period_end
      ? new Date(profile.current_period_end)
      : null,
    now: new Date(),
  });

  if (!entitlement.canWrite) {
    return jsonError("체험 또는 구독이 만료되어 업로드할 수 없습니다.", 403);
  }

  const parsed = parseBody((await request.json()) as SignedUrlRequestBody);

  if ("error" in parsed) {
    return jsonError(parsed.error, 400);
  }

  const jobId = randomUUID();
  const serverFilename = `${randomUUID()}.csv`;
  const storageKey = `${user.id}/${jobId}/${serverFilename}`;
  const { data: job, error: insertError } = await supabase
    .from("upload_jobs")
    .insert({
      id: jobId,
      user_id: user.id,
      storage_key: storageKey,
      original_filename: parsed.originalFilename,
      card_label: parsed.cardLabel,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !job) {
    return jsonError("업로드 작업을 만들지 못했습니다.", 500);
  }

  const { data: signed, error: signedUrlError } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .createSignedUploadUrl(storageKey);

  if (signedUrlError || !signed) {
    await supabase
      .from("upload_jobs")
      .delete()
      .eq("id", jobId)
      .eq("user_id", user.id);
    return jsonError("업로드 URL을 만들지 못했습니다.", 500);
  }

  return NextResponse.json(
    {
      jobId: job.id,
      storageKey,
      uploadUrl: signed.signedUrl,
      token: signed.token,
      path: signed.path,
      maxSizeBytes: MAX_UPLOAD_BYTES,
      contentType: parsed.contentType,
    },
    { status: 201 },
  );
}
