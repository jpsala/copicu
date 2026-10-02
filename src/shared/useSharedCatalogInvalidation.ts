import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

// A renderer only observes host invalidation. It never owns the SSE transport.
export function useSharedCatalogInvalidation(refresh: () => Promise<void>, busy = false) {
  const latest = useRef(refresh);
  const blocked = useRef(busy);
  const pending = useRef(false);
  const flush = useRef<() => void>(() => {});
  const [state, setState] = useState<string | null>(null);
  latest.current = refresh; blocked.current = busy;
  useEffect(() => {
    let active = true, running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (!active || running || blocked.current || !pending.current || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (!active || blocked.current) return;
        pending.current = false; running = true;
        void latest.current().catch(() => { if (active) setState("offline"); }).finally(() => { running = false; schedule(); });
      }, 60);
    };
    flush.current = schedule;
    const subscription = listen<{ state?: string }>("shared-catalog-invalidated", event => {
      if (!active) return;
      if (event.payload.state) setState(event.payload.state);
      pending.current = true; schedule();
    }).catch(() => () => {});
    return () => { active = false; clearTimeout(timer); void subscription.then(unlisten => unlisten()); };
  }, []);
  useEffect(() => { if (!busy) flush.current(); }, [busy]);
  return state;
}
export function sharedControlMessage(state?: string | null) {
  if (state === "unsupported") return "This service uses periodic catalog updates; changes can take up to a minute.";
  if (state === "offline") return "Catalog connection interrupted. Reconnecting…";
  if (state === "denied") return "Device access was denied or revoked. Review device enrollment.";
  return null;
}
