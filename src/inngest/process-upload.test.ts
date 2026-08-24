import { afterEach, describe, expect, it, vi } from "vitest";

import type { Category } from "@/lib/categories";
import type { ColumnMapping } from "@/lib/csv/mapping";
import type { SignalForNarrative } from "@/services/openai";

const inferColumnMappingMock = vi.hoisted(() => vi.fn());
const classifyMerchantBatchMock = vi.hoisted(() => vi.fn());
const describeSignalsMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/openai", () => ({
  CLASSIFY_BATCH_SIZE: 100,
  inferColumnMapping: inferColumnMappingMock,
  classifyMerchantBatch: classifyMerchantBatchMock,
  describeSignals: describeSignalsMock,
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
} = {}) {
  const job = input.job ?? makeJob();
  const dedupeKeys = input.existingDedupeKeys ?? new Set<string>();
  const transactions: TransactionRecord[] = [];
  const savedFingerprints: Array<{ userId: string; headerHash: string }> = [];
  const updates: Array<Partial<Job> & Record<string, unknown>> = [];
  const merchantCategoryWrites: Record<string, Category> = {};
  const signalNarrativeUpdates: Record<string, string> = {};

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
    async countUnmatchedMerchants(uploadJobId: string) {
      return new Set(
        transactions
          .filter(
            (transaction) =>
              transaction.uploadJobId === uploadJobId && transaction.category === null,
          )
          .map((transaction) => transaction.merchantNormalized),
      ).size;
    },
    async getNextUnmatchedMerchantBatch(uploadJobId: string, limit: number) {
      return [
        ...new Set(
          transactions
            .filter(
              (transaction) =>
                transaction.uploadJobId === uploadJobId &&
                transaction.category === null,
            )
            .map((transaction) => transaction.merchantNormalized),
        ),
      ]
        .sort()
        .slice(0, limit);
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
