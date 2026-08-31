/**
 * 사용자가 xlsx 를 고른 순간에만 파서를 내려받는다. CSV 만 올리는 대다수
 * 사용자의 번들에 넣지 않기 위해 정적 import 를 쓰지 않는다.
 */
export async function readSheet(file: File): Promise<unknown[][]> {
  const { default: readXlsxFile } = await import("read-excel-file");

  return readXlsxFile(file) as unknown as Promise<unknown[][]>;
}
