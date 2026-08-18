"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import type { ColumnMapping } from "@/lib/csv/mapping";

type PreviewResponse = {
  header: string[];
  rows: string[][];
  mappingAttemptCount: number;
  remainingAttempts: number;
};

type ManualMappingFormProps = {
  uploadId: string;
  originalFilename: string;
  initialErrorMessage: string | null;
};

type MappingState = {
  date: string;
  amount: string;
  merchant: string;
  type: string;
};

const REQUIRED_MAPPING_MESSAGE = "날짜, 금액, 가맹점 컬럼을 모두 골라주세요";
const UNREADABLE_FILE_MESSAGE = "이 파일은 읽을 수 없습니다";
const RETRY_MAPPING_MESSAGE =
  "선택한 컬럼으로 날짜를 읽지 못했습니다. 다른 컬럼을 골라주세요";

const INITIAL_MAPPING: MappingState = {
  amount: "",
  date: "",
  merchant: "",
  type: "",
};

function isDateLike(value: string): boolean {
  return (
    /^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/.test(value.trim()) ||
    /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(value.trim())
  );
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };

    return typeof body.error === "string" ? body.error.replace(/\.$/, "") : fallback;
  } catch {
    return fallback;
  }
}

function toColumnMapping(mapping: MappingState): ColumnMapping {
  const nextMapping: ColumnMapping = {
    amount: mapping.amount,
    date: mapping.date,
    merchant: mapping.merchant,
  };

  if (mapping.type) {
    nextMapping.type = mapping.type;
  }

  return nextMapping;
}

function SelectField({
  disabled,
  label,
  name,
  onChange,
  options,
  required,
  value,
}: {
  disabled: boolean;
  label: string;
  name: keyof MappingState;
  onChange: (name: keyof MappingState, value: string) => void;
  options: string[];
  required?: boolean;
  value: string;
}) {
  return (
    <label className="manual-mapping-field">
      <span className="manual-mapping-field__label">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
      <select
        aria-label={label}
        className="manual-mapping-field__select"
        disabled={disabled}
        onChange={(event) => onChange(name, event.target.value)}
        value={value}
      >
        <option value="">{required ? "컬럼 선택" : "선택하지 않음"}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ManualMappingForm({
  initialErrorMessage,
  originalFilename,
  uploadId,
}: ManualMappingFormProps) {
  const router = useRouter();
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<MappingState>(INITIAL_MAPPING);
  const [message, setMessage] = useState<string | null>(initialErrorMessage);
  const [isLoadingPreview, setIsLoadingPreview] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isTerminal, setIsTerminal] = useState(false);
  const [cancelResult, setCancelResult] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPreview() {
      try {
        const response = await fetch(`/api/uploads/${uploadId}/preview`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(
            await readError(
              response,
              "미리보기를 불러오지 못했습니다",
            ),
          );
        }

        const nextPreview = (await response.json()) as PreviewResponse;

        if (isMounted) {
          setPreview(nextPreview);
        }
      } catch (error) {
        if (isMounted) {
          setMessage(
            error instanceof Error
              ? error.message
              : "미리보기를 불러오지 못했습니다",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingPreview(false);
        }
      }
    }

    void loadPreview();

    return () => {
      isMounted = false;
    };
  }, [uploadId]);

  const selectedColumns = useMemo(
    () =>
      new Set(
        [mapping.date, mapping.amount, mapping.merchant, mapping.type].filter(
          Boolean,
        ),
      ),
    [mapping],
  );

  function updateMapping(name: keyof MappingState, value: string) {
    setMapping((current) => ({ ...current, [name]: value }));
    setMessage(null);
  }

  async function cancelUpload() {
    setIsCancelling(true);

    try {
      const response = await fetch(`/api/uploads/${uploadId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("업로드 취소를 완료하지 못했습니다");
      }

      setCancelResult("업로드 취소 완료");
      router.refresh();
    } catch (error) {
      setCancelResult(
        error instanceof Error
          ? error.message
          : "업로드 취소를 완료하지 못했습니다",
      );
    } finally {
      setIsCancelling(false);
    }
  }

  async function handleCancel() {
    setIsTerminal(true);
    setMessage(null);
    await cancelUpload();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!mapping.date || !mapping.amount || !mapping.merchant) {
      setMessage(REQUIRED_MAPPING_MESSAGE);
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    setCancelResult(null);

    try {
      const response = await fetch(`/api/uploads/${uploadId}/mapping`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mapping: toColumnMapping(mapping) }),
      });

      if (response.status === 202) {
        router.push("/dashboard");
        router.refresh();
        return;
      }

      if (response.status === 400) {
        setMessage(
          await readError(response, REQUIRED_MAPPING_MESSAGE),
        );
        return;
      }

      if (response.status === 422) {
        setIsTerminal(true);
        setMessage(UNREADABLE_FILE_MESSAGE);
        await cancelUpload();
        return;
      }

      if (response.status === 409) {
        setMessage("이미 처리 상태가 바뀌었습니다. 업로드 이력에서 확인해 주세요");
        return;
      }

      throw new Error(
        await readError(response, "수동 매핑을 저장하지 못했습니다"),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "수동 매핑을 저장하지 못했습니다",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const fieldDisabled = isLoadingPreview || isSubmitting || isTerminal;

  return (
    <section className="manual-mapping-card">
      <div className="manual-mapping-card__header">
        <div>
          <Badge variant="yellow">수동 매핑</Badge>
          <h2 className="manual-mapping-card__title">컬럼을 직접 골라주세요</h2>
          <p className="manual-mapping-card__subtitle">
            {originalFilename} 파일의 앞 10행만 확인합니다.
          </p>
        </div>
        {preview ? (
          <div className="manual-mapping-attempts">
            <span>시도 {preview.mappingAttemptCount}회</span>
            <strong>남은 시도 {preview.remainingAttempts}회</strong>
          </div>
        ) : null}
      </div>

      {message ? (
        <p className="manual-mapping-message" role="alert">
          {message === "거래를 읽지 못했습니다. 컬럼을 다시 골라주세요"
            ? RETRY_MAPPING_MESSAGE
            : message}
        </p>
      ) : null}

      {cancelResult ? (
        <p className="manual-mapping-cancel-result">{cancelResult}</p>
      ) : null}

      {isLoadingPreview ? (
        <p className="manual-mapping-loading">미리보기를 불러오는 중</p>
      ) : null}

      {preview ? (
        <form className="manual-mapping-form" onSubmit={handleSubmit}>
          <div className="manual-mapping-fields">
            <SelectField
              disabled={fieldDisabled}
              label="날짜 컬럼"
              name="date"
              onChange={updateMapping}
              options={preview.header}
              required
              value={mapping.date}
            />
            <SelectField
              disabled={fieldDisabled}
              label="금액 컬럼"
              name="amount"
              onChange={updateMapping}
              options={preview.header}
              required
              value={mapping.amount}
            />
            <SelectField
              disabled={fieldDisabled}
              label="가맹점 컬럼"
              name="merchant"
              onChange={updateMapping}
              options={preview.header}
              required
              value={mapping.merchant}
            />
            <SelectField
              disabled={fieldDisabled}
              label="유형 컬럼"
              name="type"
              onChange={updateMapping}
              options={preview.header}
              value={mapping.type}
            />
          </div>

          <div className="manual-mapping-preview-wrap">
            <table className="manual-mapping-preview">
              <thead>
                <tr>
                  <th className="manual-mapping-preview__row-number">행</th>
                  {preview.header.map((column) => (
                    <th
                      data-selected={selectedColumns.has(column) ? "true" : undefined}
                      key={column}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, rowIndex) => (
                  <tr key={`${rowIndex}-${row.join("|")}`}>
                    <td className="manual-mapping-preview__row-number tabular-nums">
                      {rowIndex + 1}
                    </td>
                    {preview.header.map((column, columnIndex) => {
                      const value = row[columnIndex] ?? "";
                      const className = isDateLike(value)
                        ? "manual-mapping-preview__date-like"
                        : undefined;

                      return (
                        <td
                          className={className}
                          data-selected={
                            selectedColumns.has(column) ? "true" : undefined
                          }
                          key={`${column}-${columnIndex}`}
                        >
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="manual-mapping-actions">
            <Link
              className="finsight-button finsight-button--secondary finsight-button--md"
              href="/dashboard/uploads"
            >
              업로드 이력
            </Link>
            <Button
              disabled={isCancelling || isSubmitting || isLoadingPreview || isTerminal}
              onClick={handleCancel}
              size="md"
              variant="danger"
            >
              {isCancelling ? "취소 중" : "업로드 취소"}
            </Button>
            <Button disabled={fieldDisabled} size="md" type="submit">
              {isSubmitting ? "저장 중" : "매핑 확정"}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
