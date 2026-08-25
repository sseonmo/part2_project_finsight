import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { inngest } from "@/inngest/client";
import type { Category } from "@/lib/categories";
import { resolveCategories } from "@/lib/classify";
import { assignOccurrences, buildDedupeKey } from "@/lib/csv/dedupe";
import { decodeCsv } from "@/lib/csv/encoding";
import {
  applyMapping,
  type ColumnMapping,
  type ParsedRow,
} from "@/lib/csv/mapping";
import { hashHeader, parseCsv } from "@/lib/csv/parse";
import { runSanityCheck } from "@/lib/csv/sanity";
import {
  CSV_FULL_FAILURE_RATE_MAX,
  CSV_MAPPING_SAMPLE_SIZE,
  CSV_SAMPLE_SUCCESS_RATE_MIN,
} from "@/lib/csv/thresholds";
import { normalizeMerchant } from "@/lib/merchant";
import { detectSignals, type Signal } from "@/lib/signals";
import {
  fetchCategoryAmountMedians,
  fetchCategoryMonthlyTotals,
  fetchMerchantHistory,
  fetchPeriodTransactions,
  fetchSeenMerchantsBeforePeriod,
} from "@/lib/signals/queries";
import {
  CLASSIFY_BATCH_SIZE,
  classifyMerchantBatch,
  describeSignals,
  inferColumnMapping,
  type SignalForNarrative,
} from "@/services/openai";
import { createServiceRoleClient } from "@/services/supabase-service-role";
import type {
  Database,
  Json,
  TablesInsert,
  TablesUpdate,
} from "@/types/database";

const UPLOAD_BUCKET = "transaction-csv-uploads";
export const MAX_MANUAL_MAPPING_ATTEMPTS = 3;
const CLASSIFICATION_RETRY_ATTEMPTS = 3;
// 배치가 빌 때까지 도는 루프의 안전 상한. 20,000 고유 가맹점까지 받는다.
const MAX_CLASSIFICATION_BATCHES = 200;

type UploadStatus =
  Database["public"]["Enums"]["upload_job_status"];

export type ProcessUploadEvent = {
  uploadId: string;
  userId: string;
  mapping?: ColumnMapping;
};

type UploadJob = {
  id: string;
  userId: string;
  storageKey: string;
  originalFilename: string;
  cardLabel: string;
  status: string;
  headerHash: string | null;
  mapping: ColumnMapping | null;
  mappingAttemptCount: number;
  dateFormat: string | null;
  dateFormatResolvedBy: "scan" | "assumed-iso" | null;
};

type UploadJobPatch = Partial<UploadJob> & {
  failedReason?: string | null;
  insertedCount?: number;
  duplicateCount?: number;
  skippedRows?: number;
  uncategorizedCount?: number;
  cardLabelMismatchWarning?: string | null;
};

type TransactionToInsert = {
  uploadJobId: string;
  userId: string;
  transactedOn: string;
  amount: number;
  merchantRaw: string;
  merchantNormalized: string;
  category: Category | null;
  categoryFallback: boolean;
  transactionType: "expense" | "refund" | "deposit";
  dedupeKey: string;
};

export type UploadPipelineRepository = {
  getJob(input: { uploadId: string; userId: string }): Promise<UploadJob | null>;
  updateJob(uploadId: string, patch: UploadJobPatch): Promise<void>;
  downloadFile(storageKey: string): Promise<Uint8Array>;
  hasHeaderHashMismatchForCard(input: {
    userId: string;
    uploadId: string;
    cardLabel: string;
    headerHash: string;
  }): Promise<boolean>;
  getFingerprint(input: {
    userId: string;
    headerHash: string;
  }): Promise<ColumnMapping | null>;
  saveFingerprint(input: {
    userId: string;
    headerHash: string;
    mapping: ColumnMapping;
  }): Promise<void>;
  listOverrides(
    userId: string,
    merchants: readonly string[],
  ): Promise<Record<string, Category>>;
  listMerchantCache(
    merchants: readonly string[],
  ): Promise<Record<string, Category>>;
  insertTransactions(
    transactions: readonly TransactionToInsert[],
  ): Promise<{ insertedCount: number }>;
  getNextUnmatchedMerchantBatch(
    uploadJobId: string,
    limit: number,
  ): Promise<string[]>;
  saveMerchantCategories(categories: Record<string, Category>): Promise<void>;
  updateUploadMerchantCategories(input: {
    uploadJobId: string;
    categories: Record<string, Category>;
    categoryFallback: boolean;
  }): Promise<void>;
  getUploadPeriods(uploadJobId: string): Promise<string[]>;
  fetchCategoryMonthlyTotals(
    userId: string,
    periods: readonly string[],
  ): ReturnType<typeof fetchCategoryMonthlyTotals>;
  fetchPeriodTransactions(
    userId: string,
    period: string,
  ): ReturnType<typeof fetchPeriodTransactions>;
  fetchCategoryAmountMedians(
    userId: string,
    period: string,
  ): ReturnType<typeof fetchCategoryAmountMedians>;
  fetchSeenMerchantsBeforePeriod(
    userId: string,
    period: string,
  ): ReturnType<typeof fetchSeenMerchantsBeforePeriod>;
  fetchMerchantHistory(
    userId: string,
    untilPeriod: string,
  ): ReturnType<typeof fetchMerchantHistory>;
  insertSignals(input: {
    userId: string;
    uploadJobId: string;
    signals: readonly Signal[];
  }): Promise<{ insertedCount: number }>;
  listNarrativeSignals(uploadJobId: string): Promise<SignalForNarrative[]>;
  updateSignalNarratives(narratives: Record<string, string>): Promise<void>;
};

type StepRunner = {
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>;
};

type MappingFailureInput = {
  kind: "sample" | "full";
  successRate?: number;
  failureRate?: number;
  isManualMapping: boolean;
  mappingAttemptCount: number;
};

type MappingFailureResult = {
  status: "needs_mapping" | "failed";
  reason: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toColumnMapping(value: unknown): ColumnMapping | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.date !== "string" ||
    typeof value.amount !== "string" ||
    typeof value.merchant !== "string"
  ) {
    return null;
  }

  const mapping: ColumnMapping = {
    date: value.date,
    amount: value.amount,
    merchant: value.merchant,
  };

  if (typeof value.type === "string" && value.type) {
    mapping.type = value.type;
  }

  return mapping;
}

function toDateFormatResolvedBy(
  value: string | null,
): "scan" | "assumed-iso" | null {
  return value === "scan" || value === "assumed-iso" ? value : null;
}

export function classifyMappingFailure(
  input: MappingFailureInput,
): MappingFailureResult {
  if (
    input.isManualMapping &&
    input.mappingAttemptCount >= MAX_MANUAL_MAPPING_ATTEMPTS
  ) {
    return { status: "failed", reason: "이 파일은 읽을 수 없습니다." };
  }

  return {
    status: "needs_mapping",
    reason: "거래를 읽지 못했습니다. 컬럼을 다시 골라주세요.",
  };
}

function previousPeriodOf(period: string): string {
  const [yearPart, monthPart] = period.split("-");
  const year = Number.parseInt(yearPart ?? "", 10);
  const month = Number.parseInt(monthPart ?? "", 10);
  const date = new Date(Date.UTC(year, month - 2, 1));

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function parseStoredFile(bytes: Uint8Array) {
  const { text } = decodeCsv(bytes);

  return parseCsv(text);
}

function cardMismatchWarning(cardLabel: string): string {
  return `이 파일은 '${cardLabel}'로 올린 이전 파일과 형식이 다릅니다. 다른 카드라면 삭제 후 카드를 바꿔 올려주세요.`;
}

function normalizeRows(rows: readonly ParsedRow[]): ParsedRow[] {
  return rows.map((row) => ({
    ...row,
    merchantNormalized: normalizeMerchant(row.merchantRaw),
  }));
}

async function loadParsedCsv(repository: UploadPipelineRepository, job: UploadJob) {
  return parseStoredFile(await repository.downloadFile(job.storageKey));
}

async function markMappingFailure(input: {
  repository: UploadPipelineRepository;
  job: UploadJob;
  failure: MappingFailureResult;
}) {
  await input.repository.updateJob(input.job.id, {
    status: input.failure.status,
    failedReason: input.failure.reason,
  });
}

function buildTransactions(input: {
  rows: readonly ParsedRow[];
  userId: string;
  uploadJobId: string;
  cardLabel: string;
  categories: Record<string, Category>;
}): TransactionToInsert[] {
  return assignOccurrences([...input.rows])
    .filter(
      (row): row is ParsedRow & { occurrence: number; amount: number } =>
        row.amount !== null && row.amount > 0,
    )
    .map((row) => {
      const merchantNormalized =
        row.merchantNormalized ?? normalizeMerchant(row.merchantRaw);

      return {
        uploadJobId: input.uploadJobId,
        userId: input.userId,
        transactedOn: row.transactedOn,
        amount: row.amount,
        merchantRaw: row.merchantRaw,
        merchantNormalized,
        category: input.categories[merchantNormalized] ?? null,
        categoryFallback: false,
        transactionType: row.transactionType,
        dedupeKey: buildDedupeKey({
          userId: input.userId,
          cardLabel: input.cardLabel,
          transactedOn: row.transactedOn,
          amount: row.amount,
          merchantNormalized,
          occurrence: row.occurrence,
        }),
      };
    });
}

async function classifyBatchWithFallback(
  merchants: readonly string[],
): Promise<{ categories: Record<string, Category>; fallback: boolean }> {
  for (let attempt = 1; attempt <= CLASSIFICATION_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return {
        categories: await classifyMerchantBatch([...merchants]),
        fallback: false,
      };
    } catch {
      if (attempt === CLASSIFICATION_RETRY_ATTEMPTS) {
        return {
          categories: Object.fromEntries(
            merchants.map((merchant) => [merchant, "기타" as Category]),
          ),
          fallback: true,
        };
      }
    }
  }

  return { categories: {}, fallback: false };
}

async function detectAndInsertSignals(input: {
  repository: UploadPipelineRepository;
  userId: string;
  uploadJobId: string;
  period: string;
}): Promise<number> {
  const previousPeriod = previousPeriodOf(input.period);
  const totals = await input.repository.fetchCategoryMonthlyTotals(input.userId, [
    previousPeriod,
    input.period,
  ]);
  const hasPreviousPeriod = totals.some((total) => total.period === previousPeriod);
  const signals = detectSignals({
    currentPeriod: input.period,
    previousPeriod: hasPreviousPeriod ? previousPeriod : undefined,
    categoryMonthlyTotals: totals,
    transactions: await input.repository.fetchPeriodTransactions(
      input.userId,
      input.period,
    ),
    categoryMedians: await input.repository.fetchCategoryAmountMedians(
      input.userId,
      input.period,
    ),
    seenMerchants: await input.repository.fetchSeenMerchantsBeforePeriod(
      input.userId,
      input.period,
    ),
    merchantHistory: await input.repository.fetchMerchantHistory(
      input.userId,
      input.period,
    ),
  });
  const { insertedCount } = await input.repository.insertSignals({
    userId: input.userId,
    uploadJobId: input.uploadJobId,
    signals,
  });

  return insertedCount;
}

export async function runProcessUploadPipeline(input: {
  event: ProcessUploadEvent;
  repository: UploadPipelineRepository;
  step: StepRunner;
}) {
  const { event, repository, step } = input;
  const initialJob = await repository.getJob({
    uploadId: event.uploadId,
    userId: event.userId,
  });

  if (!initialJob || initialJob.status === "completed") {
    return;
  }

  const isManualMapping = Boolean(event.mapping);

  const header = await step.run("download-and-fingerprint", async () => {
    const job = await repository.getJob({
      uploadId: event.uploadId,
      userId: event.userId,
    });

    if (!job) {
      throw new Error("Upload job not found.");
    }

    await repository.updateJob(job.id, {
      status: "parsing",
      failedReason: null,
    });

    const { header: csvHeader, rows } = await loadParsedCsv(repository, job);
    const headerHash = hashHeader(csvHeader);
    const hasMismatch = await repository.hasHeaderHashMismatchForCard({
      userId: job.userId,
      uploadId: job.id,
      cardLabel: job.cardLabel,
      headerHash,
    });

    await repository.updateJob(job.id, {
      headerHash,
      cardLabelMismatchWarning: hasMismatch
        ? cardMismatchWarning(job.cardLabel)
        : null,
    });

    return { headerHash, rowCount: rows.length };
  });

  const mappingState = await step.run("resolve-column-mapping", async () => {
    const job = await repository.getJob({
      uploadId: event.uploadId,
      userId: event.userId,
    });

    if (!job) {
      throw new Error("Upload job not found.");
    }

    if (event.mapping) {
      await repository.updateJob(job.id, { mapping: event.mapping });
      return { hasMapping: true, source: "manual" as const };
    }

    const cached = await repository.getFingerprint({
      userId: job.userId,
      headerHash: header.headerHash,
    });

    if (cached) {
      await repository.updateJob(job.id, { mapping: cached });
      return { hasMapping: true, source: "fingerprint" as const };
    }

    const { header: csvHeader, rows } = await loadParsedCsv(repository, job);
    const inferred = await inferColumnMapping(
      csvHeader,
      rows.slice(0, CSV_MAPPING_SAMPLE_SIZE),
    );

    if (!inferred) {
      await repository.updateJob(job.id, {
        status: "needs_mapping",
        failedReason: "거래를 읽지 못했습니다. 컬럼을 다시 골라주세요.",
      });

      return { hasMapping: false, source: "none" as const };
    }

    await repository.updateJob(job.id, { mapping: inferred });
    return { hasMapping: true, source: "inferred" as const };
  });

  if (!mappingState.hasMapping) {
    return;
  }

  const sampleState = await step.run("validate-sample-mapping", async () => {
    const job = await repository.getJob({
      uploadId: event.uploadId,
      userId: event.userId,
    });

    if (!job?.mapping) {
      throw new Error("Upload job mapping is missing.");
    }

    const { header: csvHeader, rows } = await loadParsedCsv(repository, job);
    const sampleRows = rows.slice(0, CSV_MAPPING_SAMPLE_SIZE);
    const trial = applyMapping(csvHeader, sampleRows, job.mapping, {
      dateFormatRows: rows,
    });

    if (
      trial.total > 0 &&
      trial.successRate < CSV_SAMPLE_SUCCESS_RATE_MIN
    ) {
      const failure = classifyMappingFailure({
        kind: "sample",
        successRate: trial.successRate,
        isManualMapping,
        mappingAttemptCount: job.mappingAttemptCount,
      });

      await markMappingFailure({ repository, job, failure });
      return { ready: false };
    }

    return { ready: true };
  });

  if (!sampleState.ready) {
    return;
  }

  const parseState = await step.run("parse-and-store-transactions", async () => {
    const job = await repository.getJob({
      uploadId: event.uploadId,
      userId: event.userId,
    });

    if (!job?.mapping) {
      throw new Error("Upload job mapping is missing.");
    }

    const { header: csvHeader, rows } = await loadParsedCsv(repository, job);
    const trial = applyMapping(csvHeader, rows, job.mapping);
    const failureRate = trial.total === 0 ? 0 : trial.failed / trial.total;

    await repository.updateJob(job.id, {
      dateFormat: trial.dateFormat,
      dateFormatResolvedBy: trial.dateFormatResolvedBy,
    });

    if (trial.total > 0 && failureRate > CSV_FULL_FAILURE_RATE_MAX) {
      const failure = classifyMappingFailure({
        kind: "full",
        failureRate,
        isManualMapping,
        mappingAttemptCount: job.mappingAttemptCount,
      });

      await markMappingFailure({ repository, job, failure });
      return { ready: false, insertedCount: 0, duplicateCount: 0, skippedRows: 0 };
    }

    const normalizedRows = normalizeRows(trial.parsed);
    const sanity = runSanityCheck(normalizedRows);

    if (!sanity.ok) {
      await repository.updateJob(job.id, {
        status: "failed",
        failedReason: sanity.reason,
      });
      return { ready: false, insertedCount: 0, duplicateCount: 0, skippedRows: 0 };
    }

    const validRows = normalizedRows.filter(
      (row) => row.amount !== null && row.amount > 0,
    );
    const merchants = [
      ...new Set(
        validRows.map((row) => row.merchantNormalized ?? normalizeMerchant(row.merchantRaw)),
      ),
    ];
    const [overrides, cache] = await Promise.all([
      repository.listOverrides(job.userId, merchants),
      repository.listMerchantCache(merchants),
    ]);
    const resolved = resolveCategories({
      normalized: merchants,
      overrides,
      cache,
    });
    const transactions = buildTransactions({
      rows: validRows,
      userId: job.userId,
      uploadJobId: job.id,
      cardLabel: job.cardLabel,
      categories: resolved.resolved,
    });
    const { insertedCount } = await repository.insertTransactions(transactions);
    const skippedRows = trial.failed + (normalizedRows.length - validRows.length);

    if (mappingState.source !== "fingerprint") {
      await repository.saveFingerprint({
        userId: job.userId,
        headerHash: header.headerHash,
        mapping: job.mapping,
      });
    }

    await repository.updateJob(job.id, {
      status: "categorizing",
      insertedCount,
      duplicateCount: transactions.length - insertedCount,
      skippedRows,
      uncategorizedCount: 0,
    });

    return {
      ready: true,
      insertedCount,
      duplicateCount: transactions.length - insertedCount,
      skippedRows,
    };
  });

  if (!parseState.ready) {
    return;
  }

  // 배치 수를 미리 세지 않는다. 고유 가맹점 수를 재는 조회 자체가 행 상한에
  // 걸려 과소 보고되면, 남은 가맹점이 영영 분류되지 않은 채 job 이 완료된다.
  let uncategorizedCount = 0;

  for (let index = 0; index < MAX_CLASSIFICATION_BATCHES; index += 1) {
    const batch = await step.run(`classify-merchants-${index + 1}`, async () => {
      const merchants = await repository.getNextUnmatchedMerchantBatch(
        event.uploadId,
        CLASSIFY_BATCH_SIZE,
      );

      if (merchants.length === 0) {
        return { fallbackCount: 0, done: true };
      }

      const { categories, fallback } = await classifyBatchWithFallback(merchants);

      if (!fallback) {
        await repository.saveMerchantCategories(categories);
      }

      await repository.updateUploadMerchantCategories({
        uploadJobId: event.uploadId,
        categories,
        categoryFallback: fallback,
      });

      return {
        fallbackCount: fallback ? merchants.length : 0,
        done: merchants.length < CLASSIFY_BATCH_SIZE,
      };
    });

    uncategorizedCount += batch.fallbackCount;

    if (batch.done) {
      break;
    }
  }

  await step.run("detect-spending-signals", async () => {
    const periods = await repository.getUploadPeriods(event.uploadId);
    let insertedCount = 0;

    for (const period of periods) {
      insertedCount += await detectAndInsertSignals({
        repository,
        userId: event.userId,
        uploadJobId: event.uploadId,
        period,
      });
    }

    return { insertedCount, periodCount: periods.length };
  });

  await step.run("describe-spending-signals", async () => {
    const signals = await repository.listNarrativeSignals(event.uploadId);

    try {
      await repository.updateSignalNarratives(await describeSignals(signals));
    } catch {
      // Narratives are optional. The UI can still render payload numbers.
    }

    await repository.updateJob(event.uploadId, {
      status: "completed",
      insertedCount: parseState.insertedCount,
      duplicateCount: parseState.duplicateCount,
      skippedRows: parseState.skippedRows,
      uncategorizedCount,
    });

    return {
      describedCount: signals.length,
      uncategorizedCount,
    };
  });
}

function toUploadJob(
  row: Database["public"]["Tables"]["upload_jobs"]["Row"],
): UploadJob {
  return {
    id: row.id,
    userId: row.user_id,
    storageKey: row.storage_key,
    originalFilename: row.original_filename,
    cardLabel: row.card_label,
    status: row.status,
    headerHash: row.header_hash,
    mapping: toColumnMapping(row.mapping),
    mappingAttemptCount: row.mapping_attempt_count,
    dateFormat: row.date_format,
    dateFormatResolvedBy: toDateFormatResolvedBy(row.date_format_resolved_by),
  };
}

function toUploadJobUpdate(patch: UploadJobPatch): TablesUpdate<"upload_jobs"> {
  const update: TablesUpdate<"upload_jobs"> = {};

  if (patch.status !== undefined) {
    update.status = patch.status as UploadStatus;
  }
  if (patch.headerHash !== undefined) {
    update.header_hash = patch.headerHash;
  }
  if (patch.mapping !== undefined) {
    update.mapping = patch.mapping as unknown as Json;
  }
  if (patch.mappingAttemptCount !== undefined) {
    update.mapping_attempt_count = patch.mappingAttemptCount;
  }
  if (patch.failedReason !== undefined) {
    update.failed_reason = patch.failedReason;
  }
  if (patch.insertedCount !== undefined) {
    update.inserted_count = patch.insertedCount;
  }
  if (patch.duplicateCount !== undefined) {
    update.duplicate_count = patch.duplicateCount;
  }
  if (patch.skippedRows !== undefined) {
    update.skipped_rows = patch.skippedRows;
  }
  if (patch.uncategorizedCount !== undefined) {
    update.uncategorized_count = patch.uncategorizedCount;
  }
  if (patch.cardLabelMismatchWarning !== undefined) {
    update.card_label_mismatch_warning = patch.cardLabelMismatchWarning;
  }
  if (patch.dateFormat !== undefined) {
    update.date_format = patch.dateFormat;
  }
  if (patch.dateFormatResolvedBy !== undefined) {
    update.date_format_resolved_by = patch.dateFormatResolvedBy;
  }

  return update;
}

export function createSupabaseUploadRepository(
  client: SupabaseClient<Database>,
): UploadPipelineRepository {
  return {
    async getJob(input) {
      const { data, error } = await client
        .from("upload_jobs")
        .select("*")
        .eq("id", input.uploadId)
        .eq("user_id", input.userId)
        .single();

      if (error || !data) {
        return null;
      }

      return toUploadJob(data);
    },
    async updateJob(uploadId, patch) {
      const { error } = await client
        .from("upload_jobs")
        .update(toUploadJobUpdate(patch))
        .eq("id", uploadId);

      if (error) {
        throw new Error(error.message);
      }
    },
    async downloadFile(storageKey) {
      const { data, error } = await client.storage
        .from(UPLOAD_BUCKET)
        .download(storageKey);

      if (error || !data) {
        throw new Error(error?.message ?? "CSV 원본 파일을 읽지 못했습니다.");
      }

      return new Uint8Array(await data.arrayBuffer());
    },
    async hasHeaderHashMismatchForCard(input) {
      const { data, error } = await client
        .from("upload_jobs")
        .select("header_hash")
        .eq("user_id", input.userId)
        .eq("card_label", input.cardLabel)
        .neq("id", input.uploadId)
        .not("header_hash", "is", null)
        .neq("header_hash", input.headerHash)
        .limit(1);

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []).length > 0;
    },
    async getFingerprint(input) {
      const { data, error } = await client
        .from("csv_format_fingerprints")
        .select("mapping")
        .eq("user_id", input.userId)
        .eq("header_hash", input.headerHash)
        .single();

      return error || !data ? null : toColumnMapping(data.mapping);
    },
    async saveFingerprint(input) {
      const { error } = await client.from("csv_format_fingerprints").upsert(
        {
          user_id: input.userId,
          header_hash: input.headerHash,
          mapping: input.mapping as unknown as Json,
        },
        { onConflict: "user_id,header_hash" },
      );

      if (error) {
        throw new Error(error.message);
      }
    },
    async listOverrides(userId, merchants) {
      if (merchants.length === 0) {
        return {};
      }

      const { data, error } = await client
        .from("user_category_overrides")
        .select("merchant_normalized, category")
        .eq("user_id", userId)
        .in("merchant_normalized", [...merchants]);

      if (error) {
        throw new Error(error.message);
      }

      return Object.fromEntries(
        (data ?? []).map((row) => [row.merchant_normalized, row.category]),
      );
    },
    async listMerchantCache(merchants) {
      if (merchants.length === 0) {
        return {};
      }

      const { data, error } = await client
        .from("merchant_categories")
        .select("merchant_normalized, category")
        .in("merchant_normalized", [...merchants]);

      if (error) {
        throw new Error(error.message);
      }

      return Object.fromEntries(
        (data ?? []).map((row) => [row.merchant_normalized, row.category]),
      );
    },
    async insertTransactions(transactions) {
      if (transactions.length === 0) {
        return { insertedCount: 0 };
      }

      const rows: TablesInsert<"transactions">[] = transactions.map((row) => ({
        user_id: row.userId,
        upload_job_id: row.uploadJobId,
        transacted_on: row.transactedOn,
        amount: row.amount,
        merchant_raw: row.merchantRaw,
        merchant_normalized: row.merchantNormalized,
        category: row.category,
        category_fallback: row.categoryFallback,
        transaction_type: row.transactionType,
        dedupe_key: row.dedupeKey,
      }));
      const { data, error } = await client
        .from("transactions")
        .upsert(rows, {
          onConflict: "dedupe_key",
          ignoreDuplicates: true,
        })
        .select("dedupe_key");

      if (error) {
        throw new Error(error.message);
      }

      return { insertedCount: data?.length ?? 0 };
    },
    async getNextUnmatchedMerchantBatch(uploadJobId, limit) {
      const { data, error } = await client
        .from("transactions")
        .select("merchant_normalized")
        .eq("upload_job_id", uploadJobId)
        .is("category", null)
        .order("merchant_normalized", { ascending: true });

      if (error) {
        throw new Error(error.message);
      }

      return [...new Set((data ?? []).map((row) => row.merchant_normalized))]
        .sort()
        .slice(0, limit);
    },
    async saveMerchantCategories(categories) {
      const rows = Object.entries(categories).map(
        ([merchant_normalized, category]) => ({
          merchant_normalized,
          category,
        }),
      );

      if (rows.length === 0) {
        return;
      }

      const { error } = await client
        .from("merchant_categories")
        .upsert(rows, {
          onConflict: "merchant_normalized",
          ignoreDuplicates: true,
        });

      if (error) {
        throw new Error(error.message);
      }
    },
    async updateUploadMerchantCategories(input) {
      for (const [merchant, category] of Object.entries(input.categories)) {
        const { error } = await client
          .from("transactions")
          .update({
            category,
            category_fallback: input.categoryFallback,
          })
          .eq("upload_job_id", input.uploadJobId)
          .eq("merchant_normalized", merchant)
          .is("category", null);

        if (error) {
          throw new Error(error.message);
        }
      }
    },
    async getUploadPeriods(uploadJobId) {
      // 거래 행을 전부 받아 TS 에서 줄이면 행 상한에 잘려 뒷 달이 빠진다.
      // 달 목록은 SQL 이 distinct 로 돌려준다.
      const { data, error } = await client.rpc("get_upload_periods", {
        p_upload_job_id: uploadJobId,
      });

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []).map((row) => row.period);
    },
    fetchCategoryMonthlyTotals(userId, periods) {
      return fetchCategoryMonthlyTotals(client, { userId, periods });
    },
    fetchPeriodTransactions(userId, period) {
      return fetchPeriodTransactions(client, { userId, period });
    },
    fetchCategoryAmountMedians(userId, period) {
      return fetchCategoryAmountMedians(client, { userId, period });
    },
    fetchSeenMerchantsBeforePeriod(userId, period) {
      return fetchSeenMerchantsBeforePeriod(client, { userId, period });
    },
    fetchMerchantHistory(userId, untilPeriod) {
      return fetchMerchantHistory(client, { userId, untilPeriod });
    },
    async insertSignals(input) {
      if (input.signals.length === 0) {
        return { insertedCount: 0 };
      }

      const rows: TablesInsert<"spending_signals">[] = input.signals.map(
        (signal) => ({
          user_id: input.userId,
          upload_job_id: input.uploadJobId,
          type: signal.type,
          period: signal.period,
          target_key: signal.targetKey,
          impact: signal.impact,
          payload: signal.payload as Json,
        }),
      );
      const { data, error } = await client
        .from("spending_signals")
        .upsert(rows, {
          onConflict: "user_id,type,period,target_key",
          ignoreDuplicates: true,
        })
        .select("id");

      if (error) {
        throw new Error(error.message);
      }

      return { insertedCount: data?.length ?? 0 };
    },
    async listNarrativeSignals(uploadJobId) {
      const { data, error } = await client
        .from("spending_signals")
        .select("id, type, period, target_key, impact, payload")
        .eq("upload_job_id", uploadJobId)
        .not("impact", "is", null);

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? [])
        .filter((row) => row.impact !== null)
        .map((row) => ({
          id: row.id,
          type: row.type,
          period: row.period,
          targetKey: row.target_key,
          impact: row.impact,
          payload: isRecord(row.payload)
            ? (row.payload as Record<string, unknown>)
            : {},
        }));
    },
    async updateSignalNarratives(narratives) {
      for (const [id, narrative] of Object.entries(narratives)) {
        const { error } = await client
          .from("spending_signals")
          .update({ narrative })
          .eq("id", id);

        if (error) {
          throw new Error(error.message);
        }
      }
    },
  };
}

export const processUpload = inngest.createFunction(
  {
    id: "process-upload",
    triggers: [
      { event: "csv.upload_requested" },
      { event: "csv.mapping_confirmed" },
    ],
  },
  async ({ event, step }) => {
    await runProcessUploadPipeline({
      event: event.data as ProcessUploadEvent,
      repository: createSupabaseUploadRepository(createServiceRoleClient()),
      step: {
        run: async <T>(id: string, fn: () => Promise<T> | T) =>
          (await step.run(id, fn)) as T,
      },
    });
  },
);
