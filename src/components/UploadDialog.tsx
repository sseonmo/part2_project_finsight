"use client";

import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type UploadJobSnapshot,
  type UploadJobStatus,
} from "@/components/UploadProgressCard";
import { createBrowserClient } from "@/services/supabase";

const UPLOAD_BUCKET = "transaction-csv-uploads";
const CSV_ONLY_MESSAGE =
  "CSV 파일만 올릴 수 있습니다. 카드사에서 '엑셀 저장' 대신 'CSV 저장'을 선택하세요";
const DEFAULT_CARD_LABEL = "카드 1";
const CSV_CONTENT_TYPE = "text/csv";

type SignedUrlResponse = {
  jobId: string;
  path: string;
  token: string;
  contentType: string;
};

type UploadDialogProps = {
  cardLabels: string[];
  onUploadStarted?: (job: UploadJobSnapshot) => void;
};

function isCsvFile(file: File): boolean {
  return file.size > 0 && file.name.toLocaleLowerCase("ko-KR").endsWith(".csv");
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };

    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

function initialJobSnapshot(
  id: string,
  status: UploadJobStatus,
): UploadJobSnapshot {
  return {
    id,
    status,
    failedReason: null,
    summary: {
      duplicateCount: 0,
      insertedCount: 0,
      skippedRows: 0,
      uncategorizedCount: 0,
    },
    cardLabelMismatchWarning: null,
  };
}

export function UploadDialog({
  cardLabels,
  onUploadStarted,
}: UploadDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCardLabel, setSelectedCardLabel] = useState(
    cardLabels[0] ?? DEFAULT_CARD_LABEL,
  );
  const [isNewCard, setIsNewCard] = useState(cardLabels.length === 0);
  const [newCardLabel, setNewCardLabel] = useState(DEFAULT_CARD_LABEL);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function openDialog() {
      setIsOpen(true);
      setErrorMessage(null);
    }

    window.addEventListener("finsight:upload-click", openDialog);

    return () => {
      window.removeEventListener("finsight:upload-click", openDialog);
    };
  }, []);

  useEffect(() => {
    if (cardLabels.length === 0) {
      setIsNewCard(true);
      setNewCardLabel((current) => current || DEFAULT_CARD_LABEL);
      return;
    }

    setIsNewCard(false);
    setSelectedCardLabel((current) =>
      cardLabels.includes(current) ? current : (cardLabels[0] ?? DEFAULT_CARD_LABEL),
    );
  }, [cardLabels]);

  const cardLabel = useMemo(() => {
    return (isNewCard ? newCardLabel : selectedCardLabel).trim();
  }, [isNewCard, newCardLabel, selectedCardLabel]);

  function closeDialog() {
    setIsOpen(false);
    setErrorMessage(null);
    setSelectedFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleFileChange(fileList: FileList | null) {
    const file = fileList?.[0] ?? null;
    setErrorMessage(null);
    setSelectedFile(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFile || !isCsvFile(selectedFile)) {
      setErrorMessage(CSV_ONLY_MESSAGE);
      return;
    }

    if (!cardLabel) {
      setErrorMessage("카드 이름을 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const contentType = selectedFile.type || CSV_CONTENT_TYPE;
      const signedResponse = await fetch("/api/uploads/signed-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: selectedFile.name,
          contentType,
          size: selectedFile.size,
          cardLabel,
        }),
      });

      if (!signedResponse.ok) {
        throw new Error(
          await readError(
            signedResponse,
            "업로드 URL을 만들지 못했습니다.",
          ),
        );
      }

      const signed = (await signedResponse.json()) as SignedUrlResponse;
      const supabase = createBrowserClient();
      const { error: storageError } = await supabase.storage
        .from(UPLOAD_BUCKET)
        .uploadToSignedUrl(signed.path, signed.token, selectedFile, {
          contentType: signed.contentType,
        });

      if (storageError) {
        throw new Error("원본 파일을 업로드하지 못했습니다.");
      }

      const startResponse = await fetch(`/api/uploads/${signed.jobId}/start`, {
        method: "POST",
      });

      if (!startResponse.ok) {
        throw new Error(
          await readError(
            startResponse,
            "업로드 처리를 시작하지 못했습니다.",
          ),
        );
      }

      const started = (await startResponse.json()) as {
        id: string;
        status: UploadJobStatus;
      };
      onUploadStarted?.(initialJobSnapshot(started.id, started.status));
      closeDialog();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "업로드를 시작하지 못했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="upload-dialog" role="presentation">
      <div aria-modal="true" className="upload-dialog__panel" role="dialog">
        <div className="upload-dialog__header">
          <div>
            <h2 className="upload-dialog__title">명세서 올리기</h2>
            <p className="upload-dialog__subtitle">
              CSV 파일과 카드 이름만 정하면 처리는 대시보드에서 이어집니다.
            </p>
          </div>
          <button
            aria-label="닫기"
            className="finsight-button finsight-button--ghost finsight-button--sm"
            onClick={closeDialog}
            type="button"
          >
            닫기
          </button>
        </div>

        <form className="upload-dialog__form" onSubmit={handleSubmit}>
          <label className="upload-dialog__field">
            <span className="upload-dialog__label">CSV 파일</span>
            <input
              accept=".csv,text/csv"
              className="upload-dialog__input"
              disabled={isSubmitting}
              onChange={(event) => handleFileChange(event.target.files)}
              ref={fileInputRef}
              type="file"
            />
          </label>

          {cardLabels.length > 0 && !isNewCard ? (
            <div className="upload-dialog__field">
              <label className="upload-dialog__label" htmlFor="card-label">
                카드 선택
              </label>
              <div className="upload-dialog__card-row">
                <select
                  className="upload-dialog__input"
                  disabled={isSubmitting}
                  id="card-label"
                  onChange={(event) => setSelectedCardLabel(event.target.value)}
                  value={selectedCardLabel}
                >
                  {cardLabels.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  className="finsight-button finsight-button--secondary finsight-button--sm"
                  disabled={isSubmitting}
                  onClick={() => setIsNewCard(true)}
                  type="button"
                >
                  새 카드 추가
                </button>
              </div>
            </div>
          ) : (
            <label className="upload-dialog__field">
              <span className="upload-dialog__label">카드 이름</span>
              <input
                className="upload-dialog__input"
                disabled={isSubmitting}
                onChange={(event) => setNewCardLabel(event.target.value)}
                type="text"
                value={newCardLabel}
              />
            </label>
          )}

          <section className="upload-dialog__guide" aria-labelledby="csv-guide">
            <h3 className="upload-dialog__guide-title" id="csv-guide">
              CSV 받는 법
            </h3>
            <ul className="upload-dialog__guide-list">
              <li>신한카드: 마이페이지 결제내역에서 CSV 저장</li>
              <li>KB국민카드: 이용내역 조회 후 파일 저장에서 CSV 선택</li>
              <li>현대카드: 이용대금명세서 상세 내역을 CSV로 내려받기</li>
              <li>삼성카드: 카드 이용내역에서 엑셀 대신 CSV 저장 선택</li>
              <li>우리은행: 카드/계좌 거래내역 조회 후 CSV 다운로드</li>
            </ul>
          </section>

          {errorMessage ? (
            <p className="upload-dialog__error">{errorMessage}</p>
          ) : null}

          <div className="upload-dialog__actions">
            <button
              className="finsight-button finsight-button--secondary finsight-button--md"
              disabled={isSubmitting}
              onClick={closeDialog}
              type="button"
            >
              취소
            </button>
            <button
              className="finsight-button finsight-button--primary finsight-button--md"
              disabled={isSubmitting || !cardLabel}
              type="submit"
            >
              업로드 시작
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
