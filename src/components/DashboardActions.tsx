"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/Button";

type OpenUploadButtonProps = Omit<
  ComponentPropsWithoutRef<typeof Button>,
  "onClick" | "type"
> & {
  children: ReactNode;
};

type InsightDismissButtonProps = {
  signalId: string;
};

type ReportGenerateButtonProps = {
  canWrite: boolean;
  hasReport: boolean;
  yearMonth: string;
};

export function OpenUploadButton({
  children,
  ...props
}: OpenUploadButtonProps) {
  return (
    <Button
      {...props}
      onClick={() => {
        window.dispatchEvent(new CustomEvent("finsight:upload-click"));
      }}
      type="button"
    >
      {children}
    </Button>
  );
}

export function InsightDismissButton({
  signalId,
}: InsightDismissButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function dismissSignal() {
    setErrorMessage(null);
    startTransition(async () => {
      const response = await fetch(`/api/signals/${signalId}/dismiss`, {
        method: "POST",
      });

      if (!response.ok) {
        setErrorMessage("숨기지 못했습니다.");
        return;
      }

      router.refresh();
    });
  }

  return (
    <span className="dashboard-action">
      <Button
        disabled={isPending}
        onClick={dismissSignal}
        size="sm"
        type="button"
        variant="ghost"
      >
        숨기기
      </Button>
      {errorMessage ? (
        <span className="dashboard-action__error">{errorMessage}</span>
      ) : null}
    </span>
  );
}

export function ReportGenerateButton({
  canWrite,
  hasReport,
  yearMonth,
}: ReportGenerateButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const label = hasReport ? "다시 만들기" : "리포트 만들기";

  function generateReport() {
    setErrorMessage(null);
    startTransition(async () => {
      const response = await fetch(`/api/reports/${yearMonth}`, {
        method: "POST",
      });

      if (response.status === 409) {
        setErrorMessage("이미 리포트를 생성하는 중입니다.");
        router.refresh();
        return;
      }

      if (!response.ok) {
        setErrorMessage("리포트를 만들지 못했습니다.");
        return;
      }

      router.refresh();
    });
  }

  return (
    <span className="dashboard-action report-generate-action">
      <Button
        disabled={!canWrite || isPending}
        onClick={generateReport}
        size="md"
        type="button"
        variant={hasReport ? "secondary" : "primary"}
      >
        {isPending ? "생성 중" : label}
      </Button>
      {!canWrite ? (
        <span className="dashboard-action__error">
          체험 또는 구독이 만료되어 리포트를 다시 만들 수 없습니다.
        </span>
      ) : null}
      {errorMessage ? (
        <span className="dashboard-action__error">{errorMessage}</span>
      ) : null}
    </span>
  );
}
