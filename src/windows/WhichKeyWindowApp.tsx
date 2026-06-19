import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  CompoundHotkeyPendingEvent,
  WhichKeyEntry,
  WhichKeyState,
} from "../shared/contracts";
import { UiKbd } from "../ui/controls";

const COMPOUND_HOTKEY_PENDING_EVENT = "copicu://hotkeys/compound-pending";

type RendererDiagnosticMode = "off" | "errors" | "debug";
type RendererDiagnosticLevel = "error" | "debug";
type ShortcutKeyboardEvent = Pick<
  globalThis.KeyboardEvent,
  "code" | "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
>;

function handleCompoundHotkeyStep(shortcut: string) {
  return invoke<{
    handled: boolean;
    pending: boolean;
    executed: boolean;
    diagnostic: string | null;
  }>("handle_compound_hotkey_step", { request: { shortcut } });
}

function clearCompoundHotkeyPending() {
  return invoke("clear_compound_hotkey_pending");
}

function hideWhichKeyWindow() {
  return invoke("hide_whichkey_window");
}

function getCompoundHotkeyPending() {
  return invoke<CompoundHotkeyPendingEvent | null>("get_compound_hotkey_pending");
}

function rendererDiagnosticMode(): RendererDiagnosticMode {
  const rawOverride =
    new URLSearchParams(window.location.search).get("copicuDiagnostics") ??
    window.localStorage?.getItem("copicuDiagnostics") ??
    import.meta.env.VITE_COPICU_RENDERER_DIAGNOSTICS;
  const override = rawOverride?.trim().toLocaleLowerCase();
  if (override === "debug" || override === "true" || override === "1") {
    return "debug";
  }
  if (override === "errors" || override === "error") {
    return "errors";
  }
  if (override === "off" || override === "false" || override === "0") {
    return "off";
  }
  return import.meta.env.DEV ? "debug" : "errors";
}

function rendererDebugDiagnosticsEnabled() {
  return rendererDiagnosticMode() === "debug";
}

function recordRendererDiagnostic(
  event: string,
  detail?: string,
  level: RendererDiagnosticLevel = "debug",
) {
  const mode = rendererDiagnosticMode();
  if (mode === "off" || (mode === "errors" && level !== "error")) {
    return Promise.resolve();
  }
  return invoke("record_renderer_diagnostic", {
    event,
    detail: detail ?? null,
  }).catch((error) => {
    console.warn("renderer diagnostic failed", error);
  });
}

function WhichKeyPanel({ state }: { state: WhichKeyState }) {
  const groups = new Map<string, WhichKeyEntry[]>();
  for (const entry of state.entries) {
    const group = entry.group || "Shortcuts";
    groups.set(group, [...(groups.get(group) ?? []), entry]);
  }

  return (
    <>
      <div className="whichkey-header">
        <span>{state.prefix}</span>
        <strong>Next key</strong>
      </div>
      <div className="whichkey-groups">
        {Array.from(groups, ([group, entries]) => (
          <section key={group} className="whichkey-group">
            <h2>{group}</h2>
            <div className="whichkey-entry-list">
              {entries.map((entry) => (
                <div
                  key={`${entry.routeId}-${entry.key}`}
                  className={`whichkey-entry${entry.disabled ? " is-disabled" : ""}`}
                >
                  <UiKbd>{entry.key}</UiKbd>
                  <span>{entry.label}</span>
                  {entry.diagnostic ? <em>{entry.diagnostic}</em> : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

export function WhichKeyWindowApp() {
  const [state, setState] = useState<WhichKeyState | null>(null);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const armedAtRef = useRef<number>(0);

  const hideWindow = useCallback(() => {
    void hideWhichKeyWindow().catch((error) => {
      console.warn("whichkey hide failed", error);
    });
  }, []);

  const clearAndHide = useCallback(() => {
    void clearCompoundHotkeyPending().finally(hideWindow);
  }, [hideWindow]);

  const syncPending = useCallback(() => {
    void getCompoundHotkeyPending()
      .then((pending) => {
        if (!pending) {
          recordRendererDiagnostic("whichkey-sync", "pending=none");
          setState(null);
          armedAtRef.current = 0;
          hideWindow();
          return;
        }
        const entries =
          pending.entries && pending.entries.length > 0
            ? pending.entries
            : pending.nextSteps.map((step) => ({
                key: step,
                label: `Press ${step}`,
                group: "Shortcuts",
                routeId: step,
                disabled: false,
                diagnostic: null,
              }));
        setState({
          prefix: pending.prefixLabel,
          entries,
          expiresAtUnixMs: pending.expiresAtUnixMs ?? Date.now() + 3000,
          visible: true,
        });
        recordRendererDiagnostic(
          "whichkey-sync",
          `pending=${pending.prefixLabel} entries=${entries.length}`,
        );
        if (armedAtRef.current === 0) {
          armedAtRef.current = Date.now() + 250;
        }
      })
      .catch((error) => {
        setDiagnostic(String(error));
      });
  }, [hideWindow]);

  useEffect(() => {
    document.body.classList.add("whichkey-window");
    return () => {
      document.body.classList.remove("whichkey-window");
    };
  }, []);

  useEffect(() => {
    syncPending();
    let unlisten: (() => void) | null = null;
    const interval = rendererDebugDiagnosticsEnabled()
      ? window.setInterval(syncPending, 150)
      : null;
    void listen<CompoundHotkeyPendingEvent>(COMPOUND_HOTKEY_PENDING_EVENT, () => {
      syncPending();
    }).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });
    window.addEventListener("focus", syncPending);
    return () => {
      if (interval !== null) {
        window.clearInterval(interval);
      }
      unlisten?.();
      window.removeEventListener("focus", syncPending);
    };
  }, [syncPending]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        clearAndHide();
        return;
      }

      if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      if (!state || Date.now() < armedAtRef.current) {
        return;
      }

      const shortcut = compoundShortcutFromKeyboardEvent(event);
      if (!shortcut) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void handleCompoundHotkeyStep(shortcut)
        .then((response) => {
          if (!response.pending) {
            setState(null);
            armedAtRef.current = 0;
            if (response.diagnostic) {
              setDiagnostic(response.diagnostic);
              window.setTimeout(hideWindow, 500);
            } else {
              hideWindow();
            }
            return;
          }
          syncPending();
        })
        .catch((error) => {
          setDiagnostic(String(error));
          window.setTimeout(() => clearAndHide(), 700);
        });
    };

    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [clearAndHide, hideWindow, state, syncPending]);

  return (
    <main className="whichkey-app">
      <section className="whichkey-window-panel" aria-label="WhichKey shortcuts">
        {state ? <WhichKeyPanel state={state} /> : (
          <div className="whichkey-empty">
            {diagnostic ?? "Waiting for shortcut"}
          </div>
        )}
        {diagnostic && state ? <p className="whichkey-diagnostic">{diagnostic}</p> : null}
      </section>
    </main>
  );
}

function compoundShortcutFromKeyboardEvent(event: ShortcutKeyboardEvent) {
  const key = shortcutKeyFromKeyboardEvent(event);
  if (!key) {
    return null;
  }
  const parts = [];
  if (event.ctrlKey) {
    parts.push("Ctrl");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  if (event.metaKey) {
    parts.push("Meta");
  }
  parts.push(key);
  return parts.join("+");
}

function shortcutKeyFromKeyboardEvent(event: ShortcutKeyboardEvent) {
  const keyFromCode = normalizeShortcutCode(event.code);
  if (keyFromCode) {
    return keyFromCode;
  }
  return normalizeShortcutKey(event.key);
}

function normalizeShortcutCode(code: string | undefined) {
  if (!code) {
    return null;
  }
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }
  if (/^Numpad[0-9]$/.test(code)) {
    return code.slice(6);
  }
  const namedCodes: Record<string, string> = {
    Backquote: "`",
    Backslash: "\\",
    BracketLeft: "[",
    BracketRight: "]",
    Comma: ",",
    Equal: "=",
    IntlBackslash: "\\",
    Minus: "-",
    Period: ".",
    Quote: "'",
    Semicolon: ";",
    Slash: "/",
    NumpadAdd: "+",
    NumpadDecimal: ".",
    NumpadDivide: "/",
    NumpadMultiply: "*",
    NumpadSubtract: "-",
  };
  return namedCodes[code] ?? null;
}

function normalizeShortcutKey(key: string) {
  if (key.length === 1) {
    return key === " " ? "Space" : key.toLocaleUpperCase();
  }
  const compact = key.replace(/\s+/g, "").toLocaleLowerCase();
  const namedKeys: Record<string, string> = {
    arrowdown: "ArrowDown",
    arrowleft: "ArrowLeft",
    arrowright: "ArrowRight",
    arrowup: "ArrowUp",
    backspace: "Backspace",
    delete: "Delete",
    del: "Delete",
    end: "End",
    enter: "Enter",
    escape: "Escape",
    esc: "Escape",
    home: "Home",
    insert: "Insert",
    ins: "Insert",
    pagedown: "PageDown",
    pageup: "PageUp",
    return: "Enter",
    space: "Space",
    spacebar: "Space",
    tab: "Tab",
  };
  if (/^f([1-9]|1[0-2])$/.test(compact)) {
    return compact.toLocaleUpperCase();
  }
  return namedKeys[compact] ?? null;
}
