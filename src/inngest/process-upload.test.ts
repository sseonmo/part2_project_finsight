import { afterEach, describe, expect, it, vi } from "vitest";

import type { Category } from "@/lib/categories";
import type { ColumnMapping } from "@/lib/csv/mapping";
import type { SignalForNarrative } from "@/services/openai";

const inferColumnMappingMock = vi.hoisted(() => vi.fn());
const classifyMerchantBatchMock = vi.hoisted(() => vi.fn());
const describeSignalsMock = vi.hoisted(() => vi.fn());
const createFunctionMock = vi.hoisted(() =>
  vi.fn((config: unknown, handler: unknown) => ({ config, handler })),
);
const createServiceRoleClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/openai", () => ({
  CLASSIFY_BATCH_SIZE: 100,
  inferColumnMapping: inferColumnMappingMock,
  classifyMerchantBatch: classifyMerchantBatchMock,
  describeSignals: describeSignalsMock,
}));

vi.mock("@/inngest/client", () => ({
  inngest: { createFunction: createFunctionMock },
}));

vi.mock("@/services/supabase-service-role", () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}));

vi.mock("server-only", () => ({}));

type Job = {
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

type TransactionRecord = {
  uploadJobId: string;
  dedupeKey: string;
  merchantNormalized: string;
  category: Category | null;
  categoryFallback: boolean;
};

const MAPPING = {
  date: "승인일",
  amount: "금액",
  merchant: "가맹점명",
  type: "상태",
} satisfies ColumnMapping;

function csv(rows: string[]): Uint8Array {
  return new TextEncoder().encode(["승인일,가맹점명,금액,상태", ...rows].join("\n"));
}

function row(date: string, merchant: string, amount = "50000"): string {
  return `${date},${merchant},${amount},승인`;
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: overrides.id ?? "job-1",
    userId: overrides.userId ?? "user-1",
    storageKey: overrides.storageKey ?? `${overrides.userId ?? "user-1"}/${overrides.id ?? "job-1"}/server.csv`,
    originalFilename: overrides.originalFilename ?? "card.csv",
    cardLabel: overrides.cardLabel ?? "카드 1",
    status: overrides.status ?? "pending",
    headerHash: overrides.headerHash ?? null,
    mapping: overrides.mapping ?? null,
    mappingAttemptCount: overrides.mappingAttemptCount ?? 0,
    dateFormat: overrides.dateFormat ?? null,
    dateFormatResolvedBy: overrides.dateFormatResolvedBy ?? null,
  };
}

function createStepRecorder() {
  const names: string[] = [];

  return {
    names,
    step: {
      run: vi.fn(async <T>(name: string, fn: () => Promise<T> | T): Promise<T> => {
        names.push(name);
        return await fn();
      }),
    },
  };
}

function createRepository(input: {
  job?: Job;
  bytes?: Uint8Array;
  fingerprint?: ColumnMapping | null;
  existingDedupeKeys?: Set<string>;
  narrativeSignals?: SignalForNarrative[];
  /** PostgREST 의 max_rows 를 흉내낸다. 조회 하나가 이 행 수에서 잘린다. */
  unmatchedRowCap?: number;
} = {}) {
  const job = input.job ?? makeJob();
  const dedupeKeys = input.existingDedupeKeys ?? new Set<string>();
  const transactions: TransactionRecord[] = [];
  const savedFingerprints: Array<{ userId: string; headerHash: string }> = [];
  const updates: Array<Partial<Job> & Record<string, unknown>> = [];
  const merchantCategoryWrites: Record<string, Category> = {};
  const signalNarrativeUpdates: Record<string, string> = {};
  const rowCap = input.unmatchedRowCap ?? Number.POSITIVE_INFINITY;
  const unmatchedRows = (uploadJobId: string) =>
    transactions.filter(
      (transaction) =>
        transaction.uploadJobId === uploadJobId && transaction.category === null,
    );

  return {
    job,
    transactions,
    savedFingerprints,
    updates,
    merchantCategoryWrites,
    signalNarrativeUpdates,
    async getJob({ uploadId, userId }: { uploadId: string; userId: string }) {
      return job.id === uploadId && job.userId === userId ? job : null;
    },
    async updateJob(
      _uploadId: string,
      patch: Partial<Job> & Record<string, unknown>,
    ) {
      updates.push(patch);
      Object.assign(job, patch);
    },
    async downloadFile() {
      return (
        input.bytes ??
        csv([row("2026-03-04", "스타벅스 강남점"), row("2026-03-05", "스타벅스 강남점")])
      );
    },
    async hasHeaderHashMismatchForCard() {
      return false;
    },
    async getFingerprint() {
      return input.fingerprint ?? null;
    },
    async saveFingerprint(payload: { userId: string; headerHash: string }) {
      savedFingerprints.push(payload);
    },
    async listOverrides() {
      return {};
    },
    async listMerchantCache() {
      return {};
    },
    async insertTransactions(rowsToInsert: TransactionRecord[]) {
      let insertedCount = 0;

      for (const transaction of rowsToInsert) {
        if (dedupeKeys.has(transaction.dedupeKey)) {
          continue;
        }

        dedupeKeys.add(transaction.dedupeKey);
        transactions.push(transaction);
        insertedCount += 1;
      }

      return { insertedCount };
    },
    async getNextUnmatchedMerchantBatch(uploadJobId: string, limit: number) {
      // SQL 은 merchant_normalized 로 정렬한 뒤 행 상한에 걸린다.
      return [
        ...new Set(
          unmatchedRows(uploadJobId)
            .sort((left, right) =>
              left.merchantNormalized.localeCompare(right.merchantNormalized),
            )
            .slice(0, rowCap)
            .map((transaction) => transaction.merchantNormalized),
        ),
      ].slice(0, limit);
    },
    async saveMerchantCategories(categories: Record<string, Category>) {
      Object.assign(merchantCategoryWrites, categories);
    },
    async updateUploadMerchantCategories({
      categories,
      categoryFallback,
    }: {
      uploadJobId: string;
      categories: Record<string, Category>;
      categoryFallback: boolean;
    }) {
      for (const transaction of transactions) {
        const category = categories[transaction.merchantNormalized];

        if (category) {
          transaction.category = category;
          transaction.categoryFallback = categoryFallback;
        }
      }
    },
    async getUploadPeriods() {
      return ["2026-03-01"];
    },
    async fetchCategoryMonthlyTotals() {
      return [];
    },
    async fetchPeriodTransactions() {
      return [];
    },
    async fetchCategoryAmountMedians() {
      return [];
    },
    async fetchSeenMerchantsBeforePeriod() {
      return [];
    },
    async fetchMerchantHistory() {
      return [];
    },
    async insertSignals() {
      return { insertedCount: 0 };
    },
    async listNarrativeSignals() {
      return input.narrativeSignals ?? [];
    },
    async updateSignalNarratives(narratives: Record<string, string>) {
      Object.assign(signalNarrativeUpdates, narratives);
    },
  };
}

async function runWithRepository(
  repository: ReturnType<typeof createRepository>,
  mapping?: ColumnMapping,
) {
  const { runProcessUploadPipeline } = await import("./process-upload");
  const stepRecorder = createStepRecorder();

  await runProcessUploadPipeline({
    event: {
      uploadId: repository.job.id,
      userId: repository.job.userId,
      ...(mapping ? { mapping } : {}),
    },
    repository,
    step: stepRecorder.step,
  });

  return stepRecorder;
}

describe("process upload pipeline", () => {
  afterEach(() => {
    vi.resetModules();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does not increase inserted_count when the same file is processed twice", async () => {
    classifyMerchantBatchMock.mockResolvedValue({});
    describeSignalsMock.mockResolvedValue({});
    const dedupeKeys = new Set<string>();
    const firstRepository = createRepository({
      job: makeJob({ id: "job-1", mapping: MAPPING }),
      fingerprint: MAPPING,
      existingDedupeKeys: dedupeKeys,
    });
    const secondRepository = createRepository({
      job: makeJob({ id: "job-2", mapping: MAPPING }),
      fingerprint: MAPPING,
      existingDedupeKeys: dedupeKeys,
    });

    await runWithRepository(firstRepository);
    await runWithRepository(secondRepository);

    expect(firstRepository.updates.at(-1)).toMatchObject({
      status: "completed",
      insertedCount: 2,
      duplicateCount: 0,
    });
    expect(secondRepository.updates.at(-1)).toMatchObject({
      status: "completed",
      insertedCount: 0,
      duplicateCount: 2,
    });
  });

  it("maps an 89% sample success rate to needs_mapping", async () => {
    const { classifyMappingFailure } = await import("./process-upload");

    expect(
      classifyMappingFailure({
        kind: "sample",
        successRate: 0.89,
        isManualMapping: false,
        mappingAttemptCount: 0,
      }),
    ).toEqual({ status: "needs_mapping", reason: "거래를 읽지 못했습니다. 컬럼을 다시 골라주세요." });
  });

  it("sends sample failures to needs_mapping and does not save a fingerprint", async () => {
    inferColumnMappingMock.mockResolvedValue(MAPPING);
    const repository = createRepository({
      bytes: csv([
        ...Array.from({ length: 3 }, (_, index) => row("날짜아님", `실패${index}`)),
        ...Array.from({ length: 17 }, (_, index) => row("2026-03-04", `성공${index}`)),
      ]),
    });

    await runWithRepository(repository);

    expect(repository.job.status).toBe("needs_mapping");
    expect(repository.savedFingerprints).toEqual([]);
  });

  it("sends 21% full-file parsing failures to needs_mapping and does not save a fingerprint", async () => {
    inferColumnMappingMock.mockResolvedValue(MAPPING);
    const repository = createRepository({
      bytes: csv([
        ...Array.from({ length: 79 }, (_, index) => row("2026-03-04", `성공${index}`)),
        ...Array.from({ length: 21 }, (_, index) => row("날짜아님", `실패${index}`)),
      ]),
    });

    await runWithRepository(repository);

    expect(repository.job.status).toBe("needs_mapping");
    expect(repository.savedFingerprints).toEqual([]);
  });

  it("sends a manual mapping whose amounts are unreadable back to needs_mapping", async () => {
    // 금액 컬럼을 잘못 고른 것뿐인데 failed 로 끝나면 남은 시도 횟수가 있어도
    // 컬럼을 다시 고를 수 없다(S10). 자동 매핑 경로의 판정은 그대로 둔다.
    inferColumnMappingMock.mockResolvedValue(MAPPING);
    const repository = createRepository({
      job: makeJob({ mapping: MAPPING, mappingAttemptCount: 1, status: "needs_mapping" }),
      bytes: csv(
        Array.from({ length: 20 }, (_, index) => row("2026-03-04", `가맹점${index}`, "금액아님")),
      ),
    });

    await runWithRepository(repository, MAPPING);

    expect(repository.job.status).toBe("needs_mapping");
    expect(repository.savedFingerprints).toEqual([]);
  });

  it("still fails a manual mapping once the attempt limit is reached", async () => {
    inferColumnMappingMock.mockResolvedValue(MAPPING);
    const repository = createRepository({
      job: makeJob({ mapping: MAPPING, mappingAttemptCount: 3, status: "needs_mapping" }),
      bytes: csv(
        Array.from({ length: 20 }, (_, index) => row("2026-03-04", `가맹점${index}`, "금액아님")),
      ),
    });

    await runWithRepository(repository, MAPPING);

    expect(repository.job.status).toBe("failed");
  });

  it("fails an automatic mapping whose amounts are unreadable", async () => {
    inferColumnMappingMock.mockResolvedValue(MAPPING);
    const repository = createRepository({
      bytes: csv(
        Array.from({ length: 20 }, (_, index) => row("2026-03-04", `가맹점${index}`, "금액아님")),
      ),
    });

    await runWithRepository(repository);

    expect(repository.job.status).toBe("failed");
  });

  it("fails a manual mapping on a file with no data rows", async () => {
    // 헤더만 있는 파일은 컬럼을 다시 골라도 읽을 것이 없다.
    inferColumnMappingMock.mockResolvedValue(MAPPING);
    const repository = createRepository({
      job: makeJob({ mapping: MAPPING, mappingAttemptCount: 1, status: "needs_mapping" }),
      bytes: csv([]),
    });

    await runWithRepository(repository, MAPPING);

    expect(repository.job.status).toBe("failed");
  });

  it("stores the date format from the full-file mapping trial", async () => {
    classifyMerchantBatchMock.mockResolvedValue({});
    describeSignalsMock.mockResolvedValue({});
    const repository = createRepository({
      fingerprint: MAPPING,
      bytes: csv([
        ...Array.from({ length: 20 }, (_, index) =>
          row("03/04/2026", `모호${index}`),
        ),
        row("13/04/2026", "판별가맹점"),
      ]),
    });

    await runWithRepository(repository);

    expect(repository.updates).toContainEqual(
      expect.objectContaining({
        dateFormat: "DD/MM/YYYY",
        dateFormatResolvedBy: "scan",
      }),
    );
  });

  it("fails sanity-check failures and does not save a fingerprint", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T00:00:00.000Z"));
    inferColumnMappingMock.mockResolvedValue(MAPPING);
    const repository = createRepository({
      bytes: csv(Array.from({ length: 20 }, (_, index) => row("2035-03-04", `미래${index}`))),
    });

    await runWithRepository(repository);

    expect(repository.job.status).toBe("failed");
    expect(repository.updates.at(-1)).toMatchObject({
      failedReason: "거래일이 미래이거나 10년 이전인 행이 너무 많습니다.",
    });
    expect(repository.savedFingerprints).toEqual([]);
  });

  it("runs one classification step per 100 unmatched merchants", async () => {
    classifyMerchantBatchMock.mockImplementation(async (names: string[]) =>
      Object.fromEntries(names.map((name) => [name, "식비"])),
    );
    describeSignalsMock.mockResolvedValue({});
    const repository = createRepository({
      fingerprint: MAPPING,
      bytes: csv(
        Array.from({ length: 250 }, (_, index) =>
          row("2026-03-04", `테스트가맹점${String(index).padStart(3, "0")}A`),
        ),
      ),
    });

    const stepRecorder = await runWithRepository(repository);

    expect(
      stepRecorder.names.filter((name) => name.startsWith("classify-merchants-")),
    ).toHaveLength(3);
    expect(classifyMerchantBatchMock.mock.calls.map((call) => call[0].length)).toEqual([
      100,
      100,
      50,
    ]);
  });

  it("classifies every unmatched merchant even when the row cap truncates the count", async () => {
    classifyMerchantBatchMock.mockImplementation(async (names: string[]) =>
      Object.fromEntries(names.map((name) => [name, "식비"])),
    );
    describeSignalsMock.mockResolvedValue({});
    const repository = createRepository({
      fingerprint: MAPPING,
      // 미분류 거래가 상한을 넘으면 고유 가맹점 수 조회가 잘린다.
      unmatchedRowCap: 100,
      bytes: csv(
        Array.from({ length: 150 }, (_, index) =>
          row("2026-03-04", `테스트가맹점${String(index).padStart(3, "0")}A`),
        ),
      ),
    });

    await runWithRepository(repository);

    expect(repository.transactions).toHaveLength(150);
    expect(
      repository.transactions.filter(
        (transaction) => transaction.category === null,
      ),
    ).toEqual([]);
  });

  it("asks the database for distinct months instead of counting rows in memory", async () => {
    // 거래 행을 전부 받아 TS 에서 Set 으로 줄이면 행 상한에 잘려 뒷 달이
    // periods 에서 빠지고, 그 달 신호가 아예 만들어지지 않는다.
    const { createSupabaseUploadRepository } = await import("./process-upload");
    const rpcCalls: { fn: string; args: unknown }[] = [];
    const client = {
      rpc: (fn: string, args: unknown) => {
        rpcCalls.push({ fn, args });

        return Promise.resolve({
          data: [{ period: "2026-03-01" }, { period: "2026-04-01" }],
          error: null,
        });
      },
      from: () => {
        throw new Error("거래 행을 직접 읽으면 안 된다.");
      },
    };

    const periods = await createSupabaseUploadRepository(
      client as never,
    ).getUploadPeriods("job-1");

    expect(periods).toEqual(["2026-03-01", "2026-04-01"]);
    expect(rpcCalls[0]?.fn).toBe("get_upload_periods");
  });

  it("never overwrites a merchant category that is already in the global cache", async () => {
    const { createSupabaseUploadRepository } = await import("./process-upload");
    const upsertCalls: { table: string; options: unknown }[] = [];
    const client = {
      from: (table: string) => ({
        upsert: (_rows: unknown, options: unknown) => {
          upsertCalls.push({ table, options });

          return Promise.resolve({ error: null });
        },
      }),
    };

    await createSupabaseUploadRepository(
      client as never,
    ).saveMerchantCategories({ STARBUCKS: "카페/간식" });

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]?.table).toBe("merchant_categories");
    expect(upsertCalls[0]?.options).toEqual({
      onConflict: "merchant_normalized",
      ignoreDuplicates: true,
    });
  });

  it("marks transactions as category_fallback when a classification batch fails after retries", async () => {
    classifyMerchantBatchMock.mockRejectedValue(new Error("OpenAI unavailable"));
    describeSignalsMock.mockResolvedValue({});
    const repository = createRepository({
      fingerprint: MAPPING,
      bytes: csv([row("2026-03-04", "새가맹점")]),
    });

    await runWithRepository(repository);

    expect(classifyMerchantBatchMock).toHaveBeenCalledTimes(3);
    expect(repository.transactions[0]).toMatchObject({
      category: "기타",
      categoryFallback: true,
    });
    expect(repository.updates.at(-1)).toMatchObject({
      status: "completed",
      uncategorizedCount: 1,
    });
  });

  it("passes every impact signal for narrative instead of cutting to the top three", async () => {
    classifyMerchantBatchMock.mockResolvedValue({});
    describeSignalsMock.mockResolvedValue({
      "signal-1": "문장 1",
      "signal-2": "문장 2",
      "signal-3": "문장 3",
      "signal-4": "문장 4",
    });
    const narrativeSignals = Array.from({ length: 4 }, (_, index) => ({
      id: `signal-${index + 1}`,
      type: "outlier_transaction" as const,
      period: "2026-03-01",
      targetKey: `tx-${index + 1}`,
      impact: 50_000 + index,
      payload: {
        amount: 50_000 + index,
        merchantNormalized: `가맹점${index + 1}`,
      },
    }));
    const repository = createRepository({
      fingerprint: MAPPING,
      narrativeSignals,
    });

    await runWithRepository(repository);

    expect(describeSignalsMock).toHaveBeenCalledWith(narrativeSignals);
    expect(repository.signalNarrativeUpdates).toEqual({
      "signal-1": "문장 1",
      "signal-2": "문장 2",
      "signal-3": "문장 3",
      "signal-4": "문장 4",
    });
  });
});

type RecordedUpdate = {
  table: string;
  id: string;
  patch: Record<string, unknown>;
};

/** service role 클라이언트가 실제로 쓴 UPDATE 만 기록하는 최소 스텁. */
function createUpdateRecorder() {
  const updates: RecordedUpdate[] = [];

  return {
    updates,
    client: {
      from(table: string) {
        return {
          update(patch: Record<string, unknown>) {
            return {
              async eq(_column: string, id: string) {
                updates.push({ table, id, patch });
                return { error: null };
              },
            };
          },
        };
      },
    },
  };
}

type FailureHandler = (args: {
  event: {
    name: string;
    data: {
      function_id: string;
      run_id: string;
      error: { name: string; message: string };
      event: { name: string; data: { uploadId: string; userId: string } };
    };
  };
}) => Promise<void>;

function failureHandlerOf(fn: unknown): FailureHandler {
  const { config } = fn as { config: { onFailure?: FailureHandler } };

  if (!config.onFailure) {
    throw new Error("processUpload 에 onFailure 핸들러가 없다.");
  }

  return config.onFailure;
}

describe("process upload failure handling", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("marks the job failed when the run gives up, so the progress card stops polling", async () => {
    const recorder = createUpdateRecorder();
    createServiceRoleClientMock.mockReturnValue(recorder.client);

    const { processUpload, UPLOAD_RUN_FAILURE_REASON } = await import(
      "./process-upload"
    );

    await failureHandlerOf(processUpload)({
      event: {
        name: "inngest/function.failed",
        data: {
          function_id: "finsight-process-upload",
          run_id: "run-1",
          error: {
            name: "Error",
            message: "401 Incorrect API key provided",
          },
          event: {
            name: "csv.upload_requested",
            data: { uploadId: "job-1", userId: "user-1" },
          },
        },
      },
    });

    expect(recorder.updates).toEqual([
      {
        table: "upload_jobs",
        id: "job-1",
        patch: { status: "failed", failed_reason: UPLOAD_RUN_FAILURE_REASON },
      },
    ]);
  });
});
