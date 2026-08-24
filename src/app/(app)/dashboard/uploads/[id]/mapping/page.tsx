import { redirect } from "next/navigation";

import { ManualMappingForm } from "@/components/ManualMappingForm";
import { getSessionContext } from "@/lib/session";
import { initialMappingError } from "@/lib/uploads/mapping-message";
import { createServerClient } from "@/services/supabase";

export const dynamic = "force-dynamic";

type MappingPageProps = {
  params: Promise<{ id: string }>;
};

type UploadMappingJob = {
  id: string;
  status: string;
  original_filename: string;
  mapping_attempt_count: number;
  failed_reason: string | null;
};

export default async function ManualMappingPage({ params }: MappingPageProps) {
  const session = await getSessionContext();

  if (!session) {
    redirect("/");
  }

  const { id } = await params;
  const supabase = await createServerClient();
  const { data: job } = await supabase
    .from("upload_jobs")
    .select("id, status, original_filename, mapping_attempt_count, failed_reason")
    .eq("id", id)
    .eq("user_id", session.userId)
    .single<UploadMappingJob>();

  if (!job || job.status !== "needs_mapping") {
    redirect("/dashboard/uploads");
  }

  return (
    <div className="manual-mapping-page">
      <ManualMappingForm
        initialErrorMessage={initialMappingError({
          mappingAttemptCount: job.mapping_attempt_count,
          failedReason: job.failed_reason,
        })}
        originalFilename={job.original_filename}
        uploadId={job.id}
      />
    </div>
  );
}
