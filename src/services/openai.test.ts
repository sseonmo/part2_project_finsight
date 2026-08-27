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
  describeMonthlyReport,
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

  it("hands ratios to the prompt as whole percents instead of raw floats", async () => {
    // 원값을 그대로 넘기면 LLM 이 "비중은 0.6559428060768543 입니다" 처럼
    // 그대로 문장에 박는다. 실제로 그렇게 나온 적이 있다.
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockJsonResponse({ narratives: [{ id: "signal-1", narrative: "문장" }] });

    await describeSignals([
      {
        id: "signal-1",
        type: "outlier_transaction",
        period: "2026-06-01",
        targetKey: "tx-1",
        impact: 73_400,
        payload: {
          merchantNormalized: "이마트",
          amount: 73_400,
          categoryTotal: 111_900,
          shareOfCategory: 0.6559428060768543,
        },
      },
    ]);

    const sent = JSON.stringify(chatCompletionsCreateMock.mock.calls[0]?.[0]);

    expect(sent).not.toContain("0.6559428060768543");
    expect(sent).toContain("shareOfCategoryPercent\\\":66");
    expect(sent).not.toContain("shareOfCategory\\\":");
  });

  it("keeps integer amounts untouched while converting ratios", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockJsonResponse({ narratives: [{ id: "signal-1", narrative: "문장" }] });

    await describeSignals([
      {
        id: "signal-1",
        type: "recurring_price_up",
        period: "2026-06-01",
        targetKey: "넷플릭스",
        impact: 36_000,
        payload: { previousAmount: 9_900, currentAmount: 12_900, increaseRate: 0.303 },
      },
    ]);

    const sent = JSON.stringify(chatCompletionsCreateMock.mock.calls[0]?.[0]);

    expect(sent).toContain("9900");
    expect(sent).toContain("12900");
    expect(sent).toContain("increaseRatePercent\\\":30");
  });

  it("converts ratios above 1 into whole percents too", async () => {
    // 배수로 표현되는 비율(2.9 = 290% 증가)이 원시 실수로 프롬프트에 실려
    // "증가 비율은 2.902482269503546이며" 처럼 문장에 그대로 박힌 적이 있다.
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockJsonResponse({ narratives: [{ id: "signal-1", narrative: "문장" }] });

    await describeSignals([
      {
        id: "signal-1",
        type: "category_spike",
        period: "2026-06-01",
        targetKey: "생활/마트",
        impact: 163_700,
        payload: {
          previousAmount: 56_400,
          currentAmount: 220_100,
          increaseAmount: 163_700,
          increaseRatio: 2.902482269503546,
        },
      },
    ]);

    const sent = JSON.stringify(chatCompletionsCreateMock.mock.calls[0]?.[0]);

    expect(sent).not.toContain("2.902482269503546");
    expect(sent).toContain("increaseRatioPercent\\\":290");
    expect(sent).not.toContain("increaseRatio\\\":");
    expect(sent).toContain("163700");
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

  it("uses the narrative model once for monthly report sections with precomputed facts", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockJsonResponse({
      sections: [
        {
          heading: "이번 달 요약",
          body: "3월 지출은 SQL 집계 기준 520,000원입니다.",
        },
        {
          heading: "카테고리",
          body: "식비가 가장 큰 비중을 차지했습니다.",
        },
        {
          heading: "가맹점",
          body: "스타벅스 강남 지출이 눈에 띕니다.",
        },
        {
          heading: "다음 행동",
          body: "큰 결제는 근거 거래를 확인하세요.",
        },
      ],
    });

    await expect(
      describeMonthlyReport({
        month: "2026-03",
        totalExpense: 520_000,
        previousTotalExpense: 400_000,
        transactionCount: 42,
        categoryBreakdown: [{ category: "식비", totalAmount: 210_000 }],
        topMerchants: [
          {
            merchantNormalized: "스타\n벅\t스\u0000강남",
            totalAmount: 55_000,
          },
        ],
        signals: [
          {
            type: "category_spike",
            impact: 62_000,
            payload: {
              category: "식비",
              increaseAmount: 62_000,
              increaseRatio: 0.58,
            },
          },
        ],
      }),
    ).resolves.toEqual([
      {
        heading: "이번 달 요약",
        body: "3월 지출은 SQL 집계 기준 520,000원입니다.",
      },
      {
        heading: "카테고리",
        body: "식비가 가장 큰 비중을 차지했습니다.",
      },
      {
        heading: "가맹점",
        body: "스타벅스 강남 지출이 눈에 띕니다.",
      },
      {
        heading: "다음 행동",
        body: "큰 결제는 근거 거래를 확인하세요.",
      },
    ]);

    expect(chatCompletionsCreateMock).toHaveBeenCalledTimes(1);
    expect(chatCompletionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: OPENAI_MODELS.narrative }),
    );
    const request = JSON.stringify(chatCompletionsCreateMock.mock.calls[0]?.[0]);
    expect(request).toContain("520000");
    expect(request).toContain("400000");
    expect(request).toContain("스타 벅 스 강남");
  });

  it("tells the monthly report model not to invent prior-month comparisons", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockJsonResponse({
      sections: [
        { heading: "요약", body: "비교할 지난달 데이터가 없습니다." },
        { heading: "카테고리", body: "이번 달 카테고리만 봅니다." },
        { heading: "가맹점", body: "가맹점 합계를 봅니다." },
        { heading: "다음 행동", body: "다음 달부터 비교합니다." },
      ],
    });

    await describeMonthlyReport({
      month: "2026-03",
      totalExpense: 520_000,
      previousTotalExpense: null,
      transactionCount: 42,
      categoryBreakdown: [],
      topMerchants: [],
      signals: [],
    });

    expect(JSON.stringify(chatCompletionsCreateMock.mock.calls[0]?.[0])).toContain(
      "비교할 지난달 데이터가 없다",
    );
  });

  it("returns an empty monthly report section list for schema-invalid output", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockJsonResponse({
      sections: [
        { heading: "요약", body: "본문" },
        { heading: "", body: "제목 없음" },
      ],
    });

    await expect(
      describeMonthlyReport({
        month: "2026-03",
        totalExpense: 520_000,
        previousTotalExpense: null,
        transactionCount: 42,
        categoryBreakdown: [],
        topMerchants: [],
        signals: [],
      }),
    ).resolves.toEqual([]);
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
