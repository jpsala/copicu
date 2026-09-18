import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type Event } from "@tauri-apps/api/event";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import Check from "lucide-react/dist/esm/icons/check.mjs";
import Clipboard from "lucide-react/dist/esm/icons/clipboard.mjs";
import Copy from "lucide-react/dist/esm/icons/copy.mjs";
import MessageSquarePlus from "lucide-react/dist/esm/icons/message-square-plus.mjs";
import ShieldAlert from "lucide-react/dist/esm/icons/shield-alert.mjs";
import Square from "lucide-react/dist/esm/icons/square.mjs";
import UserRound from "lucide-react/dist/esm/icons/user-round.mjs";
import Wrench from "lucide-react/dist/esm/icons/wrench.mjs";
import X from "lucide-react/dist/esm/icons/x.mjs";
import { UiAlert, UiButton, UiIconButton, UiSelect, UiSwitch, UiTextarea } from "../ui/controls";
import { CustomWindowFrame } from "../ui/window/CustomWindowFrame";
import {
  ASSISTANT_UPDATED_EVENT,
  type AssistantApproval,
  type AssistantContext,
  type AssistantExecutionMode,
  type AssistantMessage,
  type AssistantModelCatalog,
  type AssistantSnapshot,
  formatAssistantContext,
} from "../shared/assistant";
import "./AssistantWindowApp.css";

const TAURI_RUNTIME = "__TAURI_INTERNALS__";

type ToolMessageProps = {
  message: AssistantMessage;
};

function hasTauriRuntime(): boolean {
  return Boolean((window as Window & { [TAURI_RUNTIME]?: unknown })[TAURI_RUNTIME]);
}

function redactImageData(value: string): string {
  return value.replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+/gi, "[image content omitted]");
}

function renderMarkdown(text: string) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      skipHtml
      components={{
        img: ({ alt }) => <span className="assistant-remote-media">Image content is not displayed{alt ? `: ${alt}` : ""}</span>,
        a: ({ children }) => <span className="assistant-link-text">{children}</span>,
      }}
    >
      {redactImageData(text)}
    </ReactMarkdown>
  );
}

function ToolMessage({ message }: ToolMessageProps) {
  const [expanded, setExpanded] = useState(message.status === "failed");
  const details = message.arguments ? JSON.stringify(message.arguments, null, 2) : null;
  return (
    <article className={`assistant-message assistant-tool-message is-${message.status ?? "completed"}`}>
      <button
        type="button"
        className="assistant-tool-summary"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <Wrench size={15} aria-hidden="true" />
        <span className="assistant-message-label">{message.toolName || "Tool"}</span>
        <span className="assistant-tool-status">{message.status ?? "completed"}</span>
        <span className="assistant-tool-chevron" aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
      {expanded ? (
        <div className="assistant-tool-details">
          {details ? (
            <div>
              <span className="assistant-detail-label">Arguments</span>
              <pre>{redactImageData(details)}</pre>
            </div>
          ) : null}
          {message.text ? (
            <div>
              <span className="assistant-detail-label">Result</span>
              <div className="assistant-tool-result">{renderMarkdown(message.text)}</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function ConversationMessage({ message }: { message: AssistantMessage }) {
  if (message.role === "tool") {
    return <ToolMessage message={message} />;
  }
  const isUser = message.role === "user";
  return (
    <article className={`assistant-message assistant-${message.role}-message${message.status ? ` is-${message.status}` : ""}`}>
      <div className="assistant-message-heading">
        {isUser ? <UserRound size={15} aria-hidden="true" /> : <Clipboard size={15} aria-hidden="true" />}
        <span>{isUser ? "You" : "Assistant"}</span>
        {message.status === "running" ? <span className="assistant-live-dot" aria-label="Streaming" /> : null}
        {message.status === "failed" ? <span className="assistant-message-status">Failed</span> : null}
      </div>
      <div className="assistant-message-body">
        {message.text ? renderMarkdown(message.text) : message.status === "running" ? <span className="assistant-thinking">Thinking…</span> : null}
      </div>
    </article>
  );
}

function ApprovalCard({ approval, busy, onDecision }: { approval: AssistantApproval; busy: boolean; onDecision: (approved: boolean) => void }) {
  return (
    <section className="assistant-approval" aria-label="Approval required">
      <div className="assistant-approval-heading">
        <ShieldAlert size={17} aria-hidden="true" />
        <div>
          <strong>Approval required</strong>
          <span>{approval.name === "script_save"
            ? approval.arguments.activateClipboardChange === true
              ? "This saves and activates an automatic clipboard-change script. Future captured clips can run it with your account’s file and network access."
              : "This registers a trusted script. When run, it has your account’s file and network access. Review its source below."
            : approval.name === "action_run"
              ? "This runs a trusted action with your account’s file and network access. Review the exact action and input below."
              : "This operation changes local data. Review the exact items and destination below; completed changes are not automatically undone."}</span>
        </div>
      </div>
      <div className="assistant-approval-operation">
        <code>{approval.name}</code>
        <pre>{redactImageData(JSON.stringify(approval.arguments, null, 2))}</pre>
      </div>
      <div className="assistant-approval-actions">
        <UiButton type="button" variant="default" disabled={busy} leftSection={<X size={14} />} onClick={() => onDecision(false)}>Deny</UiButton>
        <UiButton type="button" variant="filled" disabled={busy} leftSection={<Check size={14} />} onClick={() => onDecision(true)}>Approve once</UiButton>
      </div>
    </section>
  );
}

function contextSummary(context: AssistantContext): string {
  const query = context.query.trim();
  return query ? `${formatAssistantContext(context)} · “${query}”` : formatAssistantContext(context);
}

function formatReasoningEffort(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}

export function AssistantWindowApp() {
  const [snapshot, setSnapshot] = useState<AssistantSnapshot | null>(null);
  const [modelCatalog, setModelCatalog] = useState<AssistantModelCatalog | null>(null);
  const [modelCatalogError, setModelCatalogError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const mountedRef = useRef(true);
  const snapshotGenerationRef = useRef(0);
  const modelCatalogGenerationRef = useRef(0);
  const refreshModelCatalog = useCallback(async () => {
    const generation = ++modelCatalogGenerationRef.current;
    try {
      const catalog = await invoke<AssistantModelCatalog>("assistant_list_models");
      if (mountedRef.current && generation === modelCatalogGenerationRef.current) {
        setModelCatalog(catalog);
        setModelCatalogError(null);
      }
    } catch (error) {
      if (mountedRef.current && generation === modelCatalogGenerationRef.current) setModelCatalogError(String(error));
    }
  }, []);
  const refreshSnapshot = useCallback(async () => {
    const generation = ++snapshotGenerationRef.current;
    const next = await invoke<AssistantSnapshot>("assistant_snapshot");
    if (mountedRef.current && generation === snapshotGenerationRef.current) setSnapshot(next);
  }, []);

  useEffect(() => {
    document.body.classList.add("assistant-window");
    return () => document.body.classList.remove("assistant-window");
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!hasTauriRuntime()) {
      setActionError("The assistant is available in the Copicu desktop window.");
      return () => { mountedRef.current = false; };
    }
    let active = true;
    let unlisten: (() => void) | null = null;
    const refreshOnFocus = () => {
      void refreshSnapshot().catch((error) => {
        if (active) setActionError(String(error));
      });
      void refreshModelCatalog();
    };
    window.addEventListener("focus", refreshOnFocus);
    void listen<AssistantSnapshot>(ASSISTANT_UPDATED_EVENT, (event: Event<AssistantSnapshot>) => {
      snapshotGenerationRef.current += 1;
      if (active) setSnapshot(event.payload);
    }).then((stop) => {
      if (!active) {
        stop();
        return;
      }
      unlisten = stop;
      void refreshSnapshot().catch((error) => {
        if (active) setActionError(String(error));
      });
      void refreshModelCatalog();
    }).catch((error) => {
      if (active) setActionError(String(error));
    });
    return () => {
      active = false;
      snapshotGenerationRef.current += 1;
      modelCatalogGenerationRef.current += 1;
      mountedRef.current = false;
      unlisten?.();
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [refreshModelCatalog, refreshSnapshot]);
  useLayoutEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript || !nearBottomRef.current) return;
    transcript.scrollTop = transcript.scrollHeight;
  }, [snapshot?.messages, snapshot?.approval]);

  const runAction = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      if (mountedRef.current) setActionError(String(error));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, []);

  const mutateSnapshot = useCallback(async (command: string, args: Record<string, unknown>) => {
    setBusy(true);
    setActionError(null);
    const generation = snapshotGenerationRef.current;
    try {
      const next = await invoke<AssistantSnapshot>(command, args);
      if (mountedRef.current && generation === snapshotGenerationRef.current) setSnapshot(next);
    } catch (error) {
      if (mountedRef.current) setActionError(String(error));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, []);

  const controlsDisabled = busy || Boolean(snapshot?.running);
  const selectedModel = useMemo(
    () => modelCatalog?.models.find((model) => model.id === snapshot?.model) ?? null,
    [modelCatalog?.models, snapshot?.model],
  );
  const modelOptions = useMemo(() => {
    const options = modelCatalog?.models.map((model) => ({
      value: model.id,
      label: model.name || model.id,
    })) ?? [];
    if (snapshot?.model && !options.some((option) => option.value === snapshot.model)) {
      options.unshift({ value: snapshot.model, label: snapshot.model });
    }
    return options;
  }, [modelCatalog?.models, snapshot?.model]);
  const reasoningEffortOptions = useMemo(() => [
    { value: "", label: selectedModel?.reasoningEfforts.length === 0 ? "None" : "Default" },
    ...(selectedModel?.reasoningEfforts
      ?? (snapshot?.reasoningEffort ? [snapshot.reasoningEffort] : [])).map((effort) => ({
        value: effort,
        label: formatReasoningEffort(effort),
      })),
  ], [selectedModel?.reasoningEfforts, snapshot?.reasoningEffort]);
  const selectedDefault = snapshot?.defaultModel;
  const isSavedDefault = Boolean(
    selectedDefault
      && selectedDefault.model === snapshot?.model
      && selectedDefault.reasoningEffort === (snapshot?.reasoningEffort ?? null),
  );

  const changeModel = useCallback((model: string | null) => {
    if (!model || !snapshot || controlsDisabled) return;
    const nextModel = modelCatalog?.models.find((entry) => entry.id === model);
    const nextEffort = snapshot.reasoningEffort && nextModel?.reasoningEfforts.includes(snapshot.reasoningEffort)
      ? snapshot.reasoningEffort
      : null;
    void mutateSnapshot("assistant_set_model", {
      model,
      reasoningEffort: nextEffort,
      makeDefault: false,
    });
  }, [controlsDisabled, modelCatalog?.models, mutateSnapshot, snapshot]);

  const changeReasoningEffort = useCallback((reasoningEffort: string | null) => {
    if (!snapshot || controlsDisabled || !snapshot.model) return;
    void mutateSnapshot("assistant_set_model", {
      model: snapshot.model,
      reasoningEffort: reasoningEffort || null,
      makeDefault: false,
    });
  }, [controlsDisabled, mutateSnapshot, snapshot]);

  const saveDefault = useCallback(() => {
    if (!snapshot || controlsDisabled || !snapshot.model || isSavedDefault) return;
    void mutateSnapshot("assistant_set_model", {
      model: snapshot.model,
      reasoningEffort: snapshot.reasoningEffort ?? null,
      makeDefault: true,
    });
  }, [controlsDisabled, isSavedDefault, mutateSnapshot, snapshot]);

  const changeExecutionMode = useCallback((checked: boolean) => {
    if (controlsDisabled) return;
    const mode: AssistantExecutionMode = checked ? "yolo" : "confirm";
    void mutateSnapshot("assistant_set_execution_mode", { mode });
  }, [controlsDisabled, mutateSnapshot]);


  const send = useCallback(async (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy || snapshot?.running || !hasTauriRuntime()) return;
    promptRef.current?.focus({ preventScroll: true });
    setBusy(true);
    setActionError(null);
    try {
      await invoke("assistant_send", { text });
      if (mountedRef.current) setDraft("");
    } catch (error) {
      if (mountedRef.current) setActionError(String(error));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [busy, draft, snapshot?.running]);

  const decide = useCallback((approved: boolean) => {
    if (!snapshot?.approval) return;
    void runAction(async () => {
      await invoke("assistant_approve", { id: snapshot.approval!.id, approved });
      await refreshSnapshot();
    });
  }, [refreshSnapshot, runAction, snapshot?.approval]);

  const cancel = useCallback(() => {
    void runAction(async () => {
      await invoke("assistant_cancel");
      await refreshSnapshot();
    });
  }, [refreshSnapshot, runAction]);

  const reset = useCallback(() => {
    void runAction(async () => {
      await invoke("assistant_reset");
      setDraft("");
      await refreshSnapshot();
    });
  }, [refreshSnapshot, runAction]);

  const copyLatest = useCallback(async () => {
    const latest = [...(snapshot?.messages ?? [])].reverse().find((message) => message.role === "assistant" && message.text.trim());
    if (!latest) return;
    try {
      await navigator.clipboard.writeText(redactImageData(latest.text));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      setActionError(`Copy failed: ${String(error)}`);
    }
  }, [snapshot?.messages]);

  const onDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };

  const messages = snapshot?.messages ?? [];
  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant" && message.text.trim());

  return (
    <CustomWindowFrame title="Copicu Assistant" variant="document">
      <main className="assistant-window-app">
        <header className="assistant-header">
          <div className="assistant-header-main">
            <div className="assistant-heading">
              <div className="assistant-heading-mark" aria-hidden="true"><Clipboard size={17} /></div>
              <div>
                <h1>Copicu Assistant</h1>
              </div>
            </div>
            <div className="assistant-header-actions">
              <UiIconButton type="button" aria-label="Copy latest assistant response" disabled={!latestAssistant} onClick={() => void copyLatest()}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </UiIconButton>
              <UiButton type="button" aria-label="New conversation" variant="default" leftSection={<MessageSquarePlus size={15} />} disabled={busy || snapshot?.running} onClick={reset}>New conversation</UiButton>
            </div>
          </div>
          <div className="assistant-model-controls" aria-label="Assistant model and policy controls">
            <div className="assistant-model-control assistant-model-control-primary">
              <span className="assistant-control-label">Model</span>
              <UiSelect
                aria-label="Assistant model"
                title={snapshot?.model}
                searchable
                data={modelOptions}
                value={snapshot?.model || null}
                placeholder={modelCatalog ? "Select a model" : "Current model"}
                disabled={!modelCatalog || controlsDisabled}
                nothingFoundMessage="No matching models"
                onChange={changeModel}
              />
            </div>
            <div className="assistant-model-control assistant-model-control-effort">
              <span className="assistant-control-label">Reasoning</span>
              <UiSelect
                aria-label="Reasoning effort"
                data={reasoningEffortOptions}
                value={snapshot?.reasoningEffort ?? ""}
                placeholder="Default"
                disabled={!selectedModel?.reasoningEfforts.length || controlsDisabled}
                onChange={changeReasoningEffort}
              />
            </div>
            <div className="assistant-default-control">
              <UiButton type="button" variant={isSavedDefault ? "default" : "light"} disabled={!snapshot?.model || controlsDisabled || isSavedDefault} onClick={saveDefault}>
                {isSavedDefault ? "Default" : "Set default"}
              </UiButton>
              {selectedDefault && !isSavedDefault ? (
                <span className="assistant-default-status" title={selectedDefault.model}>Saved: {modelCatalog?.models.find((model) => model.id === selectedDefault.model)?.name || selectedDefault.model}{selectedDefault.reasoningEffort ? ` · ${formatReasoningEffort(selectedDefault.reasoningEffort)}` : ""}</span>
              ) : null}
            </div>
            <div className={`assistant-policy-control${snapshot?.executionMode === "yolo" ? " is-yolo" : ""}`}>
              <UiSwitch
                label="YOLO mode"
                checked={snapshot?.executionMode === "yolo"}
                disabled={controlsDisabled}
                aria-describedby="assistant-policy-copy"
                onChange={changeExecutionMode}
              />
              <span id="assistant-policy-copy" className="assistant-policy-copy">
                {snapshot?.executionMode === "yolo"
                  ? "YOLO · No approvals"
                  : "Confirm · Approve changes"}
              </span>
            </div>
          </div>
          {modelCatalogError ? (
            <p className="assistant-model-error" role="status">
              Model list unavailable: {modelCatalogError} Current model remains usable.
            </p>
          ) : null}
        </header>

        <div className="assistant-context-line" role="status">
          <span>Picker context</span>
          <strong>{snapshot ? contextSummary(snapshot.context) : "Loading context…"}</strong>
        </div>

        {!snapshot ? <div className="assistant-empty-state"><span className="assistant-spinner" aria-hidden="true" /><p>Loading conversation…</p></div> : null}
        {snapshot && !snapshot.configured ? (
          <UiAlert className="assistant-config-alert" color="yellow" variant="light">
            Configure an OpenAI-compatible provider in Settings before sending. The assistant will use that endpoint and model, and credentials stay in the desktop process.
          </UiAlert>
        ) : null}
        {snapshot?.error ? <UiAlert className="assistant-error-alert" color="red" variant="light">{snapshot.error}</UiAlert> : null}
        {actionError ? <UiAlert className="assistant-error-alert" color="red" variant="light">{actionError}</UiAlert> : null}

        <div
          ref={transcriptRef}
          className="assistant-transcript"
          role="log"
          aria-live="polite"
          aria-label="Assistant conversation"
          onScroll={(event) => {
            const element = event.currentTarget;
            nearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 72;
          }}
        >
          {messages.length === 0 && snapshot?.configured ? (
            <div className="assistant-welcome">
              <h2>Ask about your clips</h2>
              <p>Search history, inspect context, compose a response, or make a precise change. Read operations run immediately. {snapshot.executionMode === "yolo" ? "YOLO mode runs writes, exports, and trusted scripts without approval, with no universal undo." : "Confirm mode pauses writes, exports, and trusted scripts for one exact approval."}</p>
            </div>
          ) : null}
          {messages.map((message) => <ConversationMessage key={message.id} message={message} />)}
          {snapshot?.approval ? <ApprovalCard approval={snapshot.approval} busy={busy} onDecision={decide} /> : null}
        </div>

        <form className="assistant-composer" onSubmit={(event) => void send(event)}>
          <div className="assistant-composer-row">
            <UiTextarea
              ref={promptRef}
              aria-label="Message assistant"
              placeholder={snapshot?.configured ? "Ask the assistant…" : "Configure a provider to begin"}
              value={draft}
              disabled={!snapshot?.configured}
              readOnly={busy || Boolean(snapshot?.approval)}
              autosize
              minRows={2}
              maxRows={6}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={onDraftKeyDown}
            />
            <div className="assistant-composer-actions">
              {snapshot?.running ? (
                <UiButton type="button" variant="default" leftSection={<Square size={14} />} onClick={cancel}>Cancel</UiButton>
              ) : null}
              <UiButton type="submit" variant="filled" disabled={!draft.trim() || !snapshot?.configured || busy || snapshot.running || Boolean(snapshot?.approval)}>
                {snapshot?.running ? "Streaming…" : "Send"}
              </UiButton>
            </div>
          </div>
          <div className="assistant-composer-hint">Enter to send · Shift+Enter for a new line · {snapshot?.executionMode === "yolo" ? "YOLO runs writes, exports, and trusted scripts without approval. No universal undo." : "Confirm mode shows approval cards for writes, exports, and trusted scripts."}{snapshot?.approval ? " · Approve or deny the pending operation above" : ""}</div>
        </form>
      </main>
    </CustomWindowFrame>
  );
}
