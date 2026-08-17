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

vi.mock("@/services/supabase", () => ({
  createBrowserClient: createBrowserClientMock,
}));

async function openDialog() {
  await act(async () => {
    window.dispatchEvent(new CustomEvent("finsight:upload-click"));
  });
}

describe("UploadDialog", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("opens with the first card default and rejects non-CSV files before any network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<UploadDialog cardLabels={[]} onUploadStarted={vi.fn()} />);

    await openDialog();

    expect(screen.getByLabelText("카드 이름")).toHaveValue("카드 1");
    expect(screen.getByText(/신한카드/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("CSV 파일"), {
      target: {
        files: [
          new File(["fake"], "statement.xlsx", {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "업로드 시작" }));

    expect(
      await screen.findByText(
        "CSV 파일만 올릴 수 있습니다. 카드사에서 '엑셀 저장' 대신 'CSV 저장'을 선택하세요",
      ),
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
    fireEvent.change(screen.getByLabelText("CSV 파일"), {
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
});
