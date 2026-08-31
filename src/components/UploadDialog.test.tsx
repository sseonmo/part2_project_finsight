import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UploadDialog } from "./UploadDialog";

const createBrowserClientMock = vi.hoisted(() => vi.fn());
const uploadToSignedUrlMock = vi.hoisted(() => vi.fn());
const readSheetMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/supabase", () => ({
  createBrowserClient: createBrowserClientMock,
}));

vi.mock("@/lib/xlsx/readSheet", () => ({
  readSheet: readSheetMock,
}));

async function openDialog() {
  await act(async () => {
    window.dispatchEvent(new CustomEvent("finsight:upload-click"));
  });
}

// jsdom 26 의 Blob 에는 text()/arrayBuffer() 가 없고, Response 로 감싸도
// 다른 realm 의 Blob 으로 인식되어 "[object Blob]" 이 나온다. FileReader 는
// jsdom 이 실제로 구현하므로 이 환경에서 유일하게 동작하는 방법이다.
function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("UploadDialog", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("rejects unsupported files before any network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<UploadDialog cardLabels={[]} onUploadStarted={vi.fn()} />);

    await openDialog();

    expect(screen.getByLabelText("카드 이름")).toHaveValue("카드 1");
    expect(screen.getByText(/신한카드/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("명세서 파일"), {
      target: {
        files: [new File(["fake"], "statement.pdf", { type: "application/pdf" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "업로드 시작" }));

    expect(
      await screen.findByText("CSV 또는 엑셀(.xlsx) 파일만 올릴 수 있습니다."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uploads the selected CSV directly to Supabase Storage before starting the worker", async () => {
    uploadToSignedUrlMock.mockResolvedValue({ data: { path: "path" }, error: null });
    createBrowserClientMock.mockReturnValue({
      storage: {
        from: vi.fn(() => ({
          uploadToSignedUrl: uploadToSignedUrlMock,
        })),
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            contentType: "text/csv",
            jobId: "job-1",
            path: "user-1/job-1/server.csv",
            token: "signed-token",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "job-1", status: "parsing" }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const onUploadStarted = vi.fn();
    render(
      <UploadDialog
        cardLabels={["카드 1", "카드 2"]}
        onUploadStarted={onUploadStarted}
      />,
    );

    await openDialog();
    fireEvent.change(screen.getByLabelText("카드 선택"), {
      target: { value: "카드 2" },
    });
    const file = new File(["date,amount,merchant"], "statement.csv", {
      type: "text/csv",
    });
    fireEvent.change(screen.getByLabelText("명세서 파일"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "업로드 시작" }));

    await waitFor(() => {
      expect(onUploadStarted).toHaveBeenCalledWith(
        expect.objectContaining({ id: "job-1", status: "parsing" }),
      );
    });

    const [signedUrl, signedRequest] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(signedUrl).toBe("/api/uploads/signed-url");
    expect(signedRequest.method).toBe("POST");
    expect(JSON.parse(String(signedRequest.body))).toEqual({
      cardLabel: "카드 2",
      contentType: "text/csv",
      filename: "statement.csv",
      size: file.size,
    });
    expect(uploadToSignedUrlMock).toHaveBeenCalledWith(
      "user-1/job-1/server.csv",
      "signed-token",
      file,
      { contentType: "text/csv" },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/uploads/job-1/start",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("converts a selected xlsx to CSV and uploads the converted blob", async () => {
    readSheetMock.mockResolvedValue([
      [null, "> 카드이용내역", null],
      [null, "이용일자", "이용금액"],
      [null, "26.07.02", 6200],
    ]);
    uploadToSignedUrlMock.mockResolvedValue({ data: { path: "path" }, error: null });
    createBrowserClientMock.mockReturnValue({
      storage: {
        from: vi.fn(() => ({ uploadToSignedUrl: uploadToSignedUrlMock })),
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            contentType: "text/csv",
            jobId: "job-2",
            path: "user-1/job-2/server.csv",
            token: "signed-token",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "job-2", status: "parsing" }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const onUploadStarted = vi.fn();
    render(<UploadDialog cardLabels={["카드 1"]} onUploadStarted={onUploadStarted} />);

    await openDialog();
    fireEvent.change(screen.getByLabelText("명세서 파일"), {
      target: {
        files: [
          new File(["fake"], "이용대금명세서.xlsx", {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "업로드 시작" }));

    await waitFor(() => {
      expect(onUploadStarted).toHaveBeenCalledWith(
        expect.objectContaining({ id: "job-2", status: "parsing" }),
      );
    });

    const expectedCsv = "이용일자,이용금액\r\n26.07.02,6200";
    const [, signedRequest] = fetchMock.mock.calls[0] as [string, RequestInit];

    // 원본 파일명은 .xlsx 그대로 보내되, 형식과 크기는 변환 결과를 따른다.
    expect(JSON.parse(String(signedRequest.body))).toEqual({
      cardLabel: "카드 1",
      contentType: "text/csv",
      filename: "이용대금명세서.xlsx",
      size: new Blob([expectedCsv]).size,
    });

    const uploadedBlob = uploadToSignedUrlMock.mock.calls[0]?.[2] as Blob;

    expect(uploadedBlob.type).toBe("text/csv");
    expect(await readBlobText(uploadedBlob)).toBe(expectedCsv);
  });

  it("rejects an oversized xlsx before parsing or any network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<UploadDialog cardLabels={["카드 1"]} onUploadStarted={vi.fn()} />);

    await openDialog();

    const file = new File(["fake"], "big.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    Object.defineProperty(file, "size", { value: 10 * 1024 * 1024 + 1 });

    fireEvent.change(screen.getByLabelText("명세서 파일"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "업로드 시작" }));

    expect(
      await screen.findByText(
        "엑셀 파일이 너무 큽니다(10MB 이하만 가능). 카드사에서 CSV 로 내려받아 올려주세요.",
      ),
    ).toBeInTheDocument();
    expect(readSheetMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a readable error when the xlsx cannot be parsed", async () => {
    readSheetMock.mockRejectedValue(new Error("boom"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<UploadDialog cardLabels={["카드 1"]} onUploadStarted={vi.fn()} />);

    await openDialog();
    fireEvent.change(screen.getByLabelText("명세서 파일"), {
      target: {
        files: [new File(["fake"], "broken.xlsx", { type: "" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "업로드 시작" }));

    expect(
      await screen.findByText(
        "엑셀 파일을 읽지 못했습니다. 카드사에서 CSV 로 내려받아 올려주세요.",
      ),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
