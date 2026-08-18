import { NextResponse } from "next/server";

import { decodeCsv } from "@/lib/csv/encoding";
import { parseCsv } from "@/lib/csv/parse";
import { createServerClient } from "@/services/supabase";
import { createServiceRoleClient } from "@/services/supabase-service-role";

export const runtime = "nodejs";

const MAX_MANUAL_MAPPING_ATTEMPTS = 3;
const PREVIEW_ROW_LIMIT = 10;
const UPLOAD_BUCKET = "transaction-csv-uploads";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(_request: Request, context: RouteContext) {
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
    .select("id, status, storage_key, mapping_attempt_count")
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
  const serviceRole = createServiceRoleClient();
  const { data: file, error: storageError } = await serviceRole.storage
    .from(UPLOAD_BUCKET)
    .download(job.storage_key);

  if (storageError || !file) {
    return jsonError("원본 파일을 읽지 못했습니다.", 500);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { text } = decodeCsv(bytes);
  const { header, rows } = parseCsv(text);

  return NextResponse.json({
    header,
    rows: rows.slice(0, PREVIEW_ROW_LIMIT),
    mappingAttemptCount: job.mapping_attempt_count,
    remainingAttempts: Math.max(
      0,
      MAX_MANUAL_MAPPING_ATTEMPTS - job.mapping_attempt_count,
    ),
  });
}
