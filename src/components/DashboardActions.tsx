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
