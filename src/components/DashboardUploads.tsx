"use client";

import { useState } from "react";

import {
  UploadProgressCard,
  type UploadJobSnapshot,
} from "@/components/UploadProgressCard";
import { UploadDialog } from "@/components/UploadDialog";

type DashboardUploadsProps = {
  cardLabels: string[];
  initialJobs: UploadJobSnapshot[];
};

export function DashboardUploads({
  cardLabels,
  initialJobs,
}: DashboardUploadsProps) {
  const [jobs, setJobs] = useState(initialJobs);

  function handleUploadStarted(job: UploadJobSnapshot) {
    setJobs((currentJobs) => {
      if (currentJobs.some((currentJob) => currentJob.id === job.id)) {
        return currentJobs;
      }

      return [job, ...currentJobs];
    });
  }

  return (
    <section className="dashboard-uploads" aria-label="업로드 처리 상태">
      <UploadDialog
        cardLabels={cardLabels}
        onUploadStarted={handleUploadStarted}
      />
      {jobs.length > 0 ? (
        <div className="dashboard-uploads__cards">
          {jobs.map((job) => (
            <UploadProgressCard initialJob={job} key={job.id} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
