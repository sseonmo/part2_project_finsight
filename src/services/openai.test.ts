import { afterEach, describe, expect, it, vi } from "vitest";

import type { ColumnMapping } from "@/lib/csv/mapping";

const chatCompletionsCreateMock = vi.hoisted(() => vi.fn());
const openAIConstructorMock = vi.hoisted(() =>
  vi.fn(() => ({
    chat: {
      completions: {
        create: chatCompletionsCreateMock,
      },
    },
  })),
);

vi.mock("openai", () => ({
  default: openAIConstructorMock,
}));

vi.mock("server-only", () => ({}));

import {
  classifyMerchantBatch,
  describeSignals,
  inferColumnMapping,
  OPENAI_MODELS,
  sanitizeMerchantName,
} from "./openai";

function mockJsonResponse(value: unknown) {
  chatCompletionsCreateMock.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(value) } }],
  });
}

describe("OpenAI service wrapper", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it.each([
    ["스타\n벅\t스\u0000강남", "스타 벅 스 강남"],
    [" \n\t\u0000 ", ""],
  ])("sanitizes merchant prompt input %s", (raw, expected) => {
    expect(sanitizeMerchantName(raw)).toBe(expected);
  });

  it("truncates very long merchant names before prompting", () => {
    expect(sanitizeMerchantName("가".repeat(200))).toHaveLength(80);
  });

  it("falls back to 기타 when classification output is outside the enum", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockJsonResponse({
      classifications: [{ merchant: "스타벅스", category: "커피전문점" }],
    });

    await expect(classifyMerchantBatch(["스타벅스"])).resolves.toEqual({
      스타벅스: "기타",
    });
  });

  it("drops merchants returned by the model that were not in the input", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockJsonResponse({
      classifications: [
        { merchant: "스타벅스", category: "카페/간식" },
        { merchant: "프롬프트주입", category: "금융/보험" },
      ],
    });

    await expect(classifyMerchantBatch(["스타벅스"])).resolves.toEqual({
      스타벅스: "카페/간식",
    });
  });

  it("falls back only missing merchants to 기타", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockJsonResponse({
      classifications: [{ merchant: "스타벅스", category: "카페/간식" }],
    });

    await expect(classifyMerchantBatch(["스타벅스", "미응답가맹점"])).resolves.toEqual({
      스타벅스: "카페/간식",
      미응답가맹점: "기타",
    });
  });

  it("throws when a classification batch is larger than 100 unique merchants", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    await expect(
      classifyMerchantBatch(Array.from({ length: 101 }, (_, index) => `가맹점${index}`)),
    ).rejects.toThrow(/100/);
    expect(chatCompletionsCreateMock).not.toHaveBeenCalled();
  });

  it("uses the classify model for merchant classification", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockJsonResponse({
      classifications: [{ merchant: "스타벅스", category: "카페/간식" }],
    });

    await classifyMerchantBatch(["스타벅스"]);

    expect(chatCompletionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: OPENAI_MODELS.classify }),
    );
    expect(chatCompletionsCreateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ model: OPENAI_MODELS.columnMapping }),
    );
  });

  it("uses the narrative model and sends precomputed signal numbers for descriptions", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockJsonResponse({
      narratives: [{ id: "signal-1", narrative: "스타벅스 결제가 50,000원입니다." }],
    });

    await expect(
      describeSignals([
        {
          id: "signal-1",
          type: "outlier_transaction",
          period: "2026-03-01",
          targetKey: "tx-1",
          impact: 50_000,
          payload: {
            merchantNormalized: "스타\n벅\t스\u0000강남",
            amount: 50_000,
            shareOfCategory: 0.5,
          },
        },
      ]),
    ).resolves.toEqual({
      "signal-1": "스타벅스 결제가 50,000원입니다.",
    });

    expect(chatCompletionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: OPENAI_MODELS.narrative }),
    );
    expect(JSON.stringify(chatCompletionsCreateMock.mock.calls[0]?.[0])).toContain(
      "스타 벅 스 강남",
    );
    expect(JSON.stringify(chatCompletionsCreateMock.mock.calls[0]?.[0])).toContain(
      "50000",
    );
  });

  it("returns only provided signal narratives and leaves omissions to the caller", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockJsonResponse({
      narratives: [{ id: "signal-1", narrative: "첫 문장" }],
    });

    await expect(
      describeSignals([
        {
          id: "signal-1",
          type: "category_spike",
          period: "2026-03-01",
          targetKey: "식비",
          impact: 60_000,
          payload: { category: "식비", increaseAmount: 60_000 },
        },
        {
          id: "signal-2",
          type: "outlier_transaction",
          period: "2026-03-01",
          targetKey: "tx-2",
          impact: 70_000,
          payload: { merchantNormalized: "누락가맹점", amount: 70_000 },
        },
      ]),
    ).resolves.toEqual({ "signal-1": "첫 문장" });
  });

  it("returns null when inferred mapping contains columns outside the header", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockJsonResponse({
      date: "거래일",
      amount: "없는금액",
      merchant: "가맹점명",
    });

    await expect(
      inferColumnMapping(["거래일", "금액", "가맹점명"], [["2026-03-04", "5100", "스타벅스"]]),
    ).resolves.toBeNull();
  });

  it("returns a canonical header mapping when every inferred column exists", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockJsonResponse({
      date: "거래일",
      amount: "금액",
      merchant: "가맹점명",
      type: "상태",
    } satisfies ColumnMapping);

    await expect(
      inferColumnMapping(
        ["거래일", "금액", "가맹점명", "상태"],
        [["2026-03-04", "5100", "스타벅스", "승인"]],
      ),
    ).resolves.toEqual({
      date: "거래일",
      amount: "금액",
      merchant: "가맹점명",
      type: "상태",
    });
  });
});
