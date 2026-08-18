import { NextResponse } from "next/server";

import { inngest } from "@/inngest/client";
import type { ColumnMapping } from "@/lib/csv/mapping";
import { createServerClient } from "@/services/supabase";

const MAX_MANUAL_MAPPING_ATTEMPTS = 3;

type RouteContext = {
  params: Promise<{ id: string }>;
};

type MappingRequestBody = {
  mapping?: Partial<ColumnMapping>;
};

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function parseMapping(value: unknown): ColumnMapping | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const mapping = value as Partial<ColumnMapping>;

  if (
    typeof mapping.date !== "string" ||
    typeof mapping.amount !== "string" ||
    typeof mapping.merchant !== "string" ||
    !mapping.date.trim() ||
    !mapping.amount.trim() ||
    !mapping.merchant.trim()
  ) {
    return null;
  }

  const result: ColumnMapping = {
    date: mapping.date.trim(),
    amount: mapping.amount.trim(),
    merchant: mapping.merchant.trim(),
  };

  if (typeof mapping.type === "string" && mapping.type.trim()) {
    result.type = mapping.type.trim();
  }

  return result;
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("로그인이 필요합니다.", 401);
  }

  const { data: job, error: jobError } = await supabase
    .from("upload_jobs")
    .select("id, status, mapping_attempt_count")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (jobError || !job) {
    return jsonError("업로드 작업을 찾을 수 없습니다.", 404);
  }

  if (job.status !== "needs_mapping") {
    return jsonError("수동 매핑이 필요한 업로드가 아닙니다.", 409);
  }

  // 이 경로에는 entitlement 쓰기 게이트를 걸지 않는다. 이미 signed-url/start
  // 게이트를 통과해 개시된 파이프라인의 완료 경로이고, csv.mapping_confirmed는
  // 컬럼 추론 LLM 호출을 건너뛴다. 시도 상한 3회가 남용을 막는다. 여기를
  // 막으면 체험 만료 순간 needs_mapping 업로드가 영영 미완으로 남아 ADR-001의
  // 막다른 길이 되살아난다.
  if (job.mapping_attempt_count >= MAX_MANUAL_MAPPING_ATTEMPTS) {
    await supabase
      .from("upload_jobs")
      .update({
        status: "failed",
        failed_reason: "이 파일은 읽을 수 없습니다.",
      })
      .eq("id", id)
      .eq("user_id", user.id);

    return jsonError("이 파일은 읽을 수 없습니다.", 422);
  }

  const mapping = parseMapping(
    ((await request.json()) as MappingRequestBody).mapping,
  );

  if (!mapping) {
    return jsonError("날짜, 금액, 가맹점 컬럼을 모두 골라주세요.", 400);
  }

  const nextAttemptCount = job.mapping_attempt_count + 1;
  const { error: updateError } = await supabase
    .from("upload_jobs")
    .update({
      status: "parsing",
      mapping,
      mapping_attempt_count: nextAttemptCount,
      failed_reason: null,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .single();

  if (updateError) {
    return jsonError("수동 매핑을 저장하지 못했습니다.", 500);
  }

  try {
    await inngest.send({
      name: "csv.mapping_confirmed",
      data: { uploadId: id, userId: user.id, mapping },
    });
  } catch {
    await supabase
      .from("upload_jobs")
      .update({
        status: "needs_mapping",
        failed_reason: "수동 매핑 처리를 시작하지 못했습니다.",
      })
      .eq("id", id)
      .eq("user_id", user.id);

    return jsonError("수동 매핑 처리를 시작하지 못했습니다.", 500);
  }

  return NextResponse.json(
    { id, status: "parsing", mappingAttemptCount: nextAttemptCount },
    { status: 202 },
  );
}
