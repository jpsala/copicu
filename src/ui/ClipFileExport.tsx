import { useEffect, useRef, useState } from "react";
import type { AppSettings } from "../shared/settings";
import { invoke } from "@tauri-apps/api/core";
import { UiButton } from "./controls";
import { Modal } from "@mantine/core";
import { exportSelectedFiles, type ClipFileExportResult as ItemResult } from "../shared/clipFileExport";

type ExportScope = "selected" | "marked";

/** One shared operation for menu entry points. IDs are frozen before the native
 * dialog; cancellation finishes the one in-flight item, then stops. */
export function useClipFileExport(preferences: AppSettings["export"]) {
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [openingFolder, setOpeningFolder] = useState(false);
  const [requested, setRequested] = useState(0);
  const [scope, setScope] = useState<ExportScope>("selected");
  const [results, setResults] = useState<ItemResult[]>([]);
  const [destination, setDestination] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const [compressed, setCompressed] = useState(false);
  const [archive, setArchive] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const cancel = useRef(false);
  const running = useRef(false);

  useEffect(() => () => {
    cancel.current = true;
    if (tokenRef.current) void invoke("finish_clip_export", { token: tokenRef.current, publish: false }).catch(() => {});
  }, []);

  async function save(selection: readonly number[], source: ExportScope = "selected", asZip = false) {
    if (running.current || selection.length === 0) return;
    const ids = [...selection]; // Never substitute the active clip or visible history.
    const openAfterSave = preferences.openDestinationAfterSave;
    const aiNames = preferences.aiNames; // Freeze opt-in before the dialog.
    running.current = true;
    cancel.current = false;
    setBusy(true); setRequested(ids.length); setScope(source); setResults([]); setDestination(null); setCancelled(false); setMessage(""); setCompressed(asZip); setArchive(null); setFinishing(false); setDialogOpen(false);
    try {
      const folder = await invoke<string | null>("choose_clip_export_folder");
      if (!folder) { setCancelled(true); setRequested(0); return; }
      setDestination(folder);
      const allowAi = aiNames ? await invoke<boolean>("confirm_clip_export_ai", { count: ids.length }) : false;
      setDialogOpen(true);
      const token = await invoke<string>("begin_clip_export", { folder, ids, compressed: asZip, allowAi });
      tokenRef.current = token;
      const outcome = await exportSelectedFiles(ids,
        () => invoke<ItemResult>("next_clip_export", { token }),
        () => cancel.current, setResults);
      const stopped = asZip ? cancel.current : outcome.cancelled;
      setCancelled(stopped);
      setFinishing(true);
      const finished = await invoke<{ archive: string | null; published: boolean; warning: string | null }>("finish_clip_export", { token, publish: !stopped });
      tokenRef.current = null;
      const completed = outcome.results.map((item): ItemResult => item.status !== "prepared" ? item : finished.published
        ? { ...item, status: "saved" }
        : { ...item, status: "skipped", detail: "Not saved: ZIP was cancelled or not published" });
      setResults(completed); setArchive(finished.archive); setMessage(finished.warning ?? (asZip && !finished.published && !stopped ? "No ZIP created: no clips could be exported." : ""));
      if (openAfterSave && finished.published && completed.some((item) => item.status === "saved")) await revealFolder(folder);
    } catch (error) {
      setDialogOpen(true);
      setResults((current) => current.map((item) => item.status === "prepared" ? { ...item, status: "failed", detail: "ZIP publication was not confirmed; inspect the destination before retrying" } : item));
      setMessage(String(error));
    } finally {
      if (tokenRef.current) {
        await invoke("finish_clip_export", { token: tokenRef.current, publish: false }).catch(() => {});
        tokenRef.current = null;
      }
      running.current = false; setBusy(false); setFinishing(false);
    }
  }

  async function revealFolder(folder: string) {
    setOpeningFolder(true);
    try { await invoke("open_clip_export_folder", { folder }); }
    catch (error) { setMessage(`Files were saved, but the destination folder could not be opened: ${String(error)}`); }
    finally { setOpeningFolder(false); }
  }

  async function openFolder() {
    if (!destination || busy || openingFolder || !results.some((item) => item.status === "saved")) return;
    await revealFolder(destination);
  }

  function stop() {
    cancel.current = true;
    setMessage("Stopping after the current file…");
  }

  function dismiss() { if (!busy && !openingFolder) setDialogOpen(false); }

  return { busy, dialogOpen, finishing, openingFolder, requested, scope, results, destination, message, cancelled, compressed, archive, save, stop, openFolder, dismiss };
}

/** Progress and results are transient; closing restores the uncluttered picker. */
export function ClipFileExportDialog({ operation, onClosed }: { operation: ReturnType<typeof useClipFileExport>; onClosed: () => void }) {
  const { busy, dialogOpen, finishing, openingFolder, requested, scope, results, destination, message, cancelled, compressed, archive, stop, openFolder, dismiss } = operation;
  const saved = results.filter((r) => r.status === "saved").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const prepared = results.filter((r) => r.status === "prepared").length;
  const warnings = results.filter((r) => r.warning).length;
  return <Modal opened={dialogOpen} onClose={dismiss} onExitTransitionEnd={onClosed} returnFocus={false}
    title={busy ? (compressed ? "Creating ZIP" : "Saving files") : cancelled ? "Export cancelled" : failed > 0 ? "Export finished with errors" : "Export complete"}
    centered size="md" withinPortal closeOnClickOutside={false} closeOnEscape={!busy && !openingFolder}
    withCloseButton={!busy} closeButtonProps={{ "aria-label": "Close export dialog", disabled: openingFolder }}
    overlayProps={{ backgroundOpacity: 0.35 }} shadow="none"
    styles={{ content: { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line)" }, header: { background: "var(--surface)", color: "var(--ink)" }, title: { fontWeight: 700, fontSize: "0.95rem" }, close: { color: "var(--ink)" } }}>
    <section aria-label="File export results" onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); dismiss(); } }}>
    {busy ? <progress value={results.length} max={Math.max(1, requested)} aria-label="Export progress" style={{ width: "100%", accentColor: "var(--accent)" }} /> : null}
    {finishing ? <p>{compressed ? "Finalizing ZIP…" : "Finishing export…"}</p> : null}
    <div role="status" aria-live="polite">
      {busy ? `Saving ${scope} clips: ${results.length}/${requested}. ` : ""}
      {cancelled ? "Cancelled. " : ""}{saved} saved, {prepared > 0 ? `${prepared} prepared, ` : ""}{skipped} omitted, {failed} failed of {requested} {scope} clips.
      {!busy && requested > results.length ? ` ${requested - results.length} not processed.` : ""}
      {warnings > 0 ? ` ${warnings} warnings; see Export details.` : ""}
      {message ? ` ${message}` : ""}
    </div>
    {archive ? <p style={{ overflowWrap: "anywhere" }}>ZIP saved: {archive}</p> : null}
    {destination ? <details><summary>Export details ({results.length}/{requested})</summary>
      <p style={{ overflowWrap: "anywhere" }}>Destination: {destination}. Stored plain text and PNG only; no rich-format conversion.</p>
      <ol style={{ maxHeight: 180, overflow: "auto", overflowWrap: "anywhere" }}>{results.map((result, index) => <li key={`${index}-${result.itemId}`}>Clip {result.itemId}: {result.status}: {result.detail}{result.warning ? ` (${result.warning})` : ""}</li>)}</ol>
    </details> : null}
    <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
      {busy ? <UiButton type="button" variant="default" disabled={finishing} onClick={stop}>{compressed ? "Cancel ZIP" : "Stop after current file"}</UiButton> : <>
        {saved > 0 && destination ? <UiButton type="button" variant="default" disabled={openingFolder} onClick={() => void openFolder()}>Open destination folder</UiButton> : null}
        <UiButton type="button" disabled={openingFolder} onClick={dismiss}>Close</UiButton>
      </>}
    </div>
    </section>
  </Modal>;
}
