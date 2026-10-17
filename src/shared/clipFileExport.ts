export type ClipFileExportResult = {
  itemId: number;
  status: "saved" | "skipped" | "failed" | "prepared";
  detail: string;
  warning?: string | null;
};

/** No active-item/visible-history fallback. Serial writes give cancellation an
 * explicit boundary and keep completed files without a persistent jobs layer. */
export async function exportSelectedFiles(
  selection: readonly number[],
  write: (id: number, ordinal: number) => Promise<ClipFileExportResult>,
  shouldStop: () => boolean,
  onProgress: (results: ClipFileExportResult[]) => void,
): Promise<{ results: ClipFileExportResult[]; cancelled: boolean }> {
  const ids = [...selection];
  const results: ClipFileExportResult[] = [];
  for (const [index, id] of ids.entries()) {
    if (shouldStop()) break;
    try { results.push(await write(id, index + 1)); }
    catch (error) { results.push({ itemId: id, status: "failed", detail: String(error) }); }
    onProgress([...results]);
  }
  return { results, cancelled: shouldStop() && results.length < ids.length };
}
