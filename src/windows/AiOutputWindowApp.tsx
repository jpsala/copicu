import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen, type Event } from "@tauri-apps/api/event";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import Copy from "lucide-react/dist/esm/icons/copy.mjs";
import Download from "lucide-react/dist/esm/icons/download.mjs";
import FilePlus2 from "lucide-react/dist/esm/icons/file-plus-2.mjs";
import { UiAlert, UiButton } from "../ui/controls";
import { CustomWindowFrame } from "../ui/window/CustomWindowFrame";


type ToastTone = "info" | "success" | "warning" | "danger";

type ToastOptions = {
  title?: string;
  message: string;
  tone?: ToastTone;
  durationMs?: number;
};

type ToastItem = Required<Pick<ToastOptions, "message" | "tone" | "durationMs">> &
  Pick<ToastOptions, "title"> & {
    id: number;
  };

type MarkdownOutputPayload = {
  title: string;
  markdown: string;
  summary?: string | null;
  source?: string | null;
  suggestedFileName?: string | null;
};


const DEFAULT_TOAST_DURATION_MS = 3600;
const STICKY_TOAST_DURATION_MS = 0;

const AI_OUTPUT_OPEN_EVENT = "copicu://ai-output/open";

function openMarkdownOutput(payload: MarkdownOutputPayload) {
  return invoke("open_markdown_output", { payload });
}

function copyMarkdownOutput(markdown: string) {
  return invoke("copy_markdown_output", { markdown });
}

function addMarkdownOutputToHistory(markdown: string) {
  return invoke<number>("add_markdown_output_to_history", { markdown });
}

function exportMarkdownOutput(payload: MarkdownOutputPayload) {
  return invoke<string>("export_markdown_output", { payload });
}

function isTauriRuntime() {
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export function AiOutputWindowApp() {
  const [output, setOutput] = useState<MarkdownOutputPayload | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextToastIdRef = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    ({
      title,
      message,
      tone = "info",
      durationMs = DEFAULT_TOAST_DURATION_MS,
    }: ToastOptions) => {
      const id = nextToastIdRef.current++;
      const toast = {
        id,
        title,
        message,
        tone,
        durationMs,
      };
      setToasts((current) => [...current, toast]);
      if (durationMs > 0) {
        window.setTimeout(() => dismissToast(id), durationMs);
      }
    },
    [dismissToast],
  );

  useEffect(() => {
    document.body.classList.add("ai-output-window");
    return () => {
      document.body.classList.remove("ai-output-window");
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) {
      setOutput({
        title: "Research summary",
        summary: "Generated from 4 synthetic clipboard items.",
        source: "AI output preview",
        suggestedFileName: "research-summary",
        markdown: [
          "# Research summary",
          "",
          "## Findings",
          "",
          "- SQLite metadata is already the right source of truth for history queries.",
          "- Scripts should use host APIs instead of direct filesystem or SQL access.",
          "- Markdown output gives AI work a reviewable surface before copy, paste or export.",
          "",
          "```ts",
          "await copicu.ui.markdownOutput({ title, markdown });",
          "```",
        ].join("\n"),
      });
      return undefined;
    }

    let active = true;
    let unlisten: (() => void) | null = null;
    void listen<MarkdownOutputPayload>(AI_OUTPUT_OPEN_EVENT, (event: Event<MarkdownOutputPayload>) => {
      if (!active) {
        return;
      }
      setOutput(event.payload);
      setStatus(null);
      setError(null);
    }).then((value) => {
      unlisten = value;
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  const runOutputAction = useCallback(
    async (label: string, action: () => Promise<unknown>) => {
      try {
        setError(null);
        setStatus(null);
        const result = await action();
        const message = typeof result === "string" && result ? result : `${label} completed.`;
        setStatus(message);
        pushToast({ title: label, message, tone: "success" });
      } catch (actionError) {
        const message = String(actionError);
        setError(message);
        pushToast({
          title: `${label} failed`,
          message,
          tone: "danger",
          durationMs: STICKY_TOAST_DURATION_MS,
        });
      }
    },
    [pushToast],
  );

  const markdown = output?.markdown ?? "";

  return (
    <CustomWindowFrame title="Copicu Output" variant="document">
      <main className="ai-output-app">
        <section className="ai-output-toolbar">
          <div className="ai-output-title">
            <strong>{output?.title ?? "No output yet"}</strong>
            {output?.summary ? <p>{output.summary}</p> : null}
          </div>
          <div className="ai-output-actions">
            <UiButton
              type="button"
              variant="default"
              leftSection={<Copy size={15} />}
              disabled={!output}
              onClick={() => void runOutputAction("Copy Markdown", () => copyMarkdownOutput(markdown))}
            >
              Copy
            </UiButton>
            <UiButton
              type="button"
              variant="default"
              leftSection={<FilePlus2 size={15} />}
              disabled={!output}
              onClick={() =>
                void runOutputAction("Add to History", async () => {
                  const id = await addMarkdownOutputToHistory(markdown);
                  return `Added item #${id}.`;
                })
              }
            >
              Add item
            </UiButton>
            <UiButton
              type="button"
              variant="filled"
              leftSection={<Download size={15} />}
              disabled={!output}
              onClick={() =>
                void runOutputAction("Export Markdown", async () => {
                  const path = await exportMarkdownOutput(output!);
                  return `Saved to ${path}`;
                })
              }
            >
              Export
            </UiButton>
          </div>
        </section>
        {output?.source ? <div className="ai-output-source">{output.source}</div> : null}
        {error ? <UiAlert className="error-text" color="red" variant="light">{error}</UiAlert> : null}
        {status ? <UiAlert className="ai-output-status" color="green" variant="light">{status}</UiAlert> : null}
        <article className="ai-output-document" aria-label="Markdown output">
          {output ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {output.markdown}
            </ReactMarkdown>
          ) : (
            <p className="ai-output-empty">No generated Markdown yet.</p>
          )}
        </article>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </main>
    </CustomWindowFrame>
  );
}


function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) {
    return null;
  }

  return createPortal(
    <ol className="toast-stack" aria-live="polite" aria-label="Notifications">
      {[...toasts].reverse().map((toast) => (
        <li
          key={toast.id}
          className={`toast-item toast-${toast.tone}`}
          style={
            { "--toast-duration": `${toast.durationMs}ms` } as CSSProperties &
              Record<"--toast-duration", string>
          }
        >
          <div>
            {toast.title ? <strong>{toast.title}</strong> : null}
            <p>{toast.message}</p>
          </div>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(toast.id)}
          >
            ×
          </button>
        </li>
      ))}
    </ol>,
    document.body,
  );
}

