import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  UploadHistoryTable,
  type UploadHistoryJob,
} from "@/components/UploadHistoryTable";
import { getSessionContext } from "@/lib/session";
import { createServerClient } from "@/services/supabase";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type UploadJobRow =
  Pick<
    Database["public"]["Tables"]["upload_jobs"]["Row"],
    | "id"
    | "original_filename"
    | "card_label"
    | "status"
    | "failed_reason"
    | "inserted_count"
    | "duplicate_count"
    | "skipped_rows"
    | "uncategorized_count"
    | "card_label_mismatch_warning"
    | "date_format"
    | "date_format_resolved_by"
    | "created_at"
  >;

const UPLOAD_HISTORY_SELECT =
  "id, original_filename, card_label, status, failed_reason, inserted_count, duplicate_count, skipped_rows, uncategorized_count, card_label_mismatch_warning, date_format, date_format_resolved_by, created_at" as const;

function toDateFormatResolvedBy(
  value: string | null,
): UploadHistoryJob["dateFormatResolvedBy"] {
  return value === "scan" || value === "assumed-iso" ? value : null;
}

type UploadJobCountRow =
  Database["public"]["Functions"]["get_upload_job_counts"]["Returns"][number];

async function fetchUploadJobs(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<UploadHistoryJob[]> {
  const { data: jobs } = await supabase
    .from("upload_jobs")
    .select(UPLOAD_HISTORY_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const uploadJobs = (jobs ?? []) satisfies UploadJobRow[];
  const ids = uploadJobs.map((job) => job.id);

  if (ids.length === 0) {
    return [];
  }

  // 행을 받아 세면 행 상한에 걸려 오래된 업로드가 0건으로 표시된다.
  const { data: countRows } = await supabase.rpc("get_upload_job_counts", {
    p_user_id: userId,
  });
  const transactionCounts = new Map<string, number>();
  const signalCounts = new Map<string, number>();

  for (const row of (countRows ?? []) as UploadJobCountRow[]) {
    transactionCounts.set(row.upload_job_id, Number(row.transaction_count));
    signalCounts.set(row.upload_job_id, Number(row.signal_count));
  }

  return uploadJobs.map((job) => ({
    cardLabel: job.card_label,
    cardLabelMismatchWarning: job.card_label_mismatch_warning,
    createdAt: job.created_at,
    dateFormat: job.date_format,
    dateFormatResolvedBy: toDateFormatResolvedBy(job.date_format_resolved_by),
    duplicateCount: job.duplicate_count,
    failedReason: job.failed_reason,
    id: job.id,
    insertedCount: job.inserted_count,
    originalFilename: job.original_filename,
    signalCount: signalCounts.get(job.id) ?? 0,
    skippedRows: job.skipped_rows,
    status: job.status,
    transactionCount: transactionCounts.get(job.id) ?? 0,
    uncategorizedCount: job.uncategorized_count,
  }));
}

export default async function UploadsPage() {
  const session = await getSessionContext();

  if (!session) {
    redirect("/");
  }

  const supabase = await createServerClient();
  const jobs = await fetchUploadJobs(supabase, session.userId);

  return (
    <div className="uploads-page">
      <section className="uploads-panel">
        <div className="uploads-panel__header">
          <div>
            <h2 className="dashboard-section-title">업로드 이력</h2>
            <p className="dashboard-panel__subtitle">
              날짜 형식이 틀리게 읽혔다면 완료된 매핑을 고치지 않고 해당 업로드를 삭제한 뒤 다시 올립니다.
            </p>
          </div>
        </div>
        <UploadHistoryTable
          canWrite={session.entitlement.canWrite}
          jobs={jobs}
        />
      </section>
    </div>
  );
}
