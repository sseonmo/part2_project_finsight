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
import { readSheet } from "@/lib/xlsx/readSheet";
import { sheetToCsv } from "@/lib/xlsx/sheetToCsv";
import { createBrowserClient } from "@/services/supabase";

const UPLOAD_BUCKET = "transaction-csv-uploads";
const UNSUPPORTED_FILE_MESSAGE = "CSV 또는 엑셀(.xlsx) 파일만 올릴 수 있습니다.";
const XLSX_READ_FAILED_MESSAGE =
  "엑셀 파일을 읽지 못했습니다. 카드사에서 CSV 로 내려받아 올려주세요.";
const XLSX_EMPTY_MESSAGE = "표를 찾지 못했습니다. 파일을 확인해 주세요.";
const MAX_XLSX_BYTES = 10 * 1024 * 1024;
const XLSX_TOO_LARGE_MESSAGE =
  "엑셀 파일이 너무 큽니다(10MB 이하만 가능). 카드사에서 CSV 로 내려받아 올려주세요.";
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

function hasExtension(file: File, extension: string): boolean {
  return file.name.toLocaleLowerCase("ko-KR").endsWith(extension);
}

function isCsvFile(file: File): boolean {
  return file.size > 0 && hasExtension(file, ".csv");
}

function isXlsxFile(file: File): boolean {
  return file.size > 0 && hasExtension(file, ".xlsx");
}

/**
 * xlsx 는 브라우저에서 CSV 로 바꿔 올린다. Storage 에 올라가는 바이트는
 * CSV 하나뿐이므로 워커는 지금 그대로 둔다.
 */
async function toUploadBlob(file: File): Promise<Blob> {
  if (!isXlsxFile(file)) {
    return file;
  }

  let csv: string;

  try {
    csv = sheetToCsv(await readSheet(file));
  } catch {
    throw new Error(XLSX_READ_FAILED_MESSAGE);
  }

  if (csv === "") {
    throw new Error(XLSX_EMPTY_MESSAGE);
  }

  return new Blob([csv], { type: CSV_CONTENT_TYPE });
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
    // 방금 만든 job 이라 이 값이 곧 서버의 created_at 이다. 2초 뒤 첫 폴링 응답이
    // 서버 값으로 덮어쓰므로 경과 시간이 어긋나 있는 구간은 없다.
    createdAt: new Date().toISOString(),
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

    if (
      !selectedFile ||
      (!isCsvFile(selectedFile) && !isXlsxFile(selectedFile))
    ) {
      setErrorMessage(UNSUPPORTED_FILE_MESSAGE);
      return;
    }

    if (isXlsxFile(selectedFile) && selectedFile.size > MAX_XLSX_BYTES) {
      setErrorMessage(XLSX_TOO_LARGE_MESSAGE);
      return;
    }

    if (!cardLabel) {
      setErrorMessage("카드 이름을 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = await toUploadBlob(selectedFile);
      const signedResponse = await fetch("/api/uploads/signed-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: selectedFile.name,
          contentType: payload.type || CSV_CONTENT_TYPE,
          size: payload.size,
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
        .uploadToSignedUrl(signed.path, signed.token, payload, {
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
              CSV 나 엑셀 파일과 카드 이름만 정하면 처리는 대시보드에서 이어집니다.
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
            <span className="upload-dialog__label">명세서 파일</span>
            <input
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
              명세서 받는 법
            </h3>
            <ul className="upload-dialog__guide-list">
              <li>신한카드: 마이페이지 결제내역에서 파일 저장</li>
              <li>KB국민카드: 이용내역 조회 후 파일 저장</li>
              <li>현대카드: 이용대금명세서 상세 내역 내려받기</li>
              <li>삼성카드: 카드 이용내역에서 파일 저장</li>
              <li>우리은행: 카드/계좌 거래내역 조회 후 다운로드</li>
            </ul>
            <p className="upload-dialog__guide-note">
              엑셀은 .xlsx 만 됩니다. .xls 로 받아졌다면 CSV 로 저장해 주세요.
            </p>
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
