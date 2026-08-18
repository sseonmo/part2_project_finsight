import { redirect } from "next/navigation";

import { ManualMappingForm } from "@/components/ManualMappingForm";
import { getSessionContext } from "@/lib/session";
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

function initialMappingError(job: UploadMappingJob): string | null {
  if (job.mapping_attempt_count > 0) {
    return "선택한 컬럼으로 날짜를 읽지 못했습니다. 다른 컬럼을 골라주세요";
  }

  return job.failed_reason;
}

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
        initialErrorMessage={initialMappingError(job)}
        originalFilename={job.original_filename}
        uploadId={job.id}
      />
    </div>
  );
}
