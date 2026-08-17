import iconv from "iconv-lite";

export type DetectedEncoding = "utf-8" | "euc-kr" | "cp949";

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return UTF8_BOM.every((byte, index) => bytes[index] === byte);
}

function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }

  return left.every((byte, index) => byte === right[index]);
}

function canRoundTrip(bytes: Uint8Array, encoding: "euc-kr" | "cp949"): boolean {
  const decoded = iconv.decode(Buffer.from(bytes), encoding);
  const encoded = iconv.encode(decoded, encoding);

  return equalBytes(bytes, new Uint8Array(encoded));
}

function hasCp949ExtensionBytePair(bytes: Uint8Array): boolean {
  for (let index = 0; index < bytes.length; index += 1) {
    const lead = bytes[index] as number;

    if (lead <= 0x7f) {
      continue;
    }

    const trail = bytes[index + 1];

    if (trail === undefined) {
      return true;
    }

    if (lead >= 0x81 && lead <= 0xa0) {
      return true;
    }

    if (lead >= 0xa1 && lead <= 0xfe && trail < 0xa1) {
      return true;
    }

    index += 1;
  }

  return false;
}

export function detectEncoding(bytes: Uint8Array): DetectedEncoding {
  if (hasUtf8Bom(bytes) || isValidUtf8(bytes)) {
    return "utf-8";
  }

  if (hasCp949ExtensionBytePair(bytes)) {
    return "cp949";
  }

  return canRoundTrip(bytes, "euc-kr") ? "euc-kr" : "cp949";
}

export function decodeCsv(bytes: Uint8Array): {
  text: string;
  encoding: DetectedEncoding;
} {
  const encoding = detectEncoding(bytes);
  const text =
    encoding === "utf-8"
      ? new TextDecoder("utf-8").decode(bytes)
      : iconv.decode(Buffer.from(bytes), encoding);

  return {
    encoding,
    text: text.replace(/^\uFEFF/, ""),
  };
}
