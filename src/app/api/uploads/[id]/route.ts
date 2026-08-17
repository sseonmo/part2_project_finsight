import { NextResponse } from "next/server";

import { createServerClient } from "@/services/supabase";

const UPLOAD_BUCKET = "transaction-csv-uploads";
const UPLOAD_JOB_SELECT =
  "id, status, failed_reason, inserted_count, duplicate_count, skipped_rows, uncategorized_count, card_label_mismatch_warning" as const;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

async function requireUser() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return { supabase, user: error ? null : user };
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return jsonError("로그인이 필요합니다.", 401);
  }

  const { data: job, error } = await supabase
    .from("upload_jobs")
    .select(UPLOAD_JOB_SELECT)
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !job) {
    return jsonError("업로드 작업을 찾을 수 없습니다.", 404);
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    failedReason: job.failed_reason,
    summary: {
      insertedCount: job.inserted_count,
      duplicateCount: job.duplicate_count,
      skippedRows: job.skipped_rows,
      uncategorizedCount: job.uncategorized_count,
    },
    cardLabelMismatchWarning: job.card_label_mismatch_warning,
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return jsonError("로그인이 필요합니다.", 401);
  }

  const { data: job, error } = await supabase
    .from("upload_jobs")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, storage_key")
    .single();

  if (error || !job) {
    return jsonError("업로드 작업을 찾을 수 없습니다.", 404);
  }

  const { error: storageError } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .remove([job.storage_key]);

  if (storageError) {
    return jsonError("원본 파일을 삭제하지 못했습니다.", 500);
  }

  return new NextResponse(null, { status: 204 });
}
