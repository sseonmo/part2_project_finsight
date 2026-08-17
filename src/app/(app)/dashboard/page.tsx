import { redirect } from "next/navigation";

import { DashboardUploads } from "@/components/DashboardUploads";
import type { UploadJobSnapshot } from "@/components/UploadProgressCard";
import { getSessionContext } from "@/lib/session";
import { createServerClient } from "@/services/supabase";

export const dynamic = "force-dynamic";

const DASHBOARD_UPLOAD_STATUSES = [
  "pending",
  "parsing",
  "categorizing",
  "needs_mapping",
] as const;

type UploadCardRow = {
  id: string;
  status: UploadJobSnapshot["status"];
  failed_reason: string | null;
  inserted_count: number;
  duplicate_count: number;
  skipped_rows: number;
  uncategorized_count: number;
  card_label_mismatch_warning: string | null;
};

function toUploadJobSnapshot(row: UploadCardRow): UploadJobSnapshot {
  return {
    id: row.id,
    status: row.status,
    failedReason: row.failed_reason,
    summary: {
      insertedCount: row.inserted_count,
      duplicateCount: row.duplicate_count,
      skippedRows: row.skipped_rows,
      uncategorizedCount: row.uncategorized_count,
    },
    cardLabelMismatchWarning: row.card_label_mismatch_warning,
  };
}

async function getCardLabels(userId: string): Promise<string[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("upload_jobs")
    .select("card_label")
    .eq("user_id", userId);

  return Array.from(
    new Set((data ?? []).map((row) => row.card_label).filter(Boolean)),
  ).sort((first, second) => first.localeCompare(second, "ko-KR"));
}

async function getDashboardUploadJobs(
  userId: string,
): Promise<UploadJobSnapshot[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("upload_jobs")
    .select(
      "id, status, failed_reason, inserted_count, duplicate_count, skipped_rows, uncategorized_count, card_label_mismatch_warning",
    )
    .eq("user_id", userId)
    .in("status", [...DASHBOARD_UPLOAD_STATUSES]);

  return ((data ?? []) as UploadCardRow[]).map(toUploadJobSnapshot);
}

export default async function DashboardPage() {
  const session = await getSessionContext();

  if (!session) {
    redirect("/");
  }

  const [cardLabels, initialJobs] = await Promise.all([
    getCardLabels(session.userId),
    getDashboardUploadJobs(session.userId),
  ]);

  return (
    <div className="dashboard-page">
      <DashboardUploads cardLabels={cardLabels} initialJobs={initialJobs} />
      <div className="app-page-placeholder" aria-hidden />
    </div>
  );
}
