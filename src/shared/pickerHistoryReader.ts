// One host-issued session per renderer client. Tokens identify intent, not DB revisions.
export const PICKER_READ_SUPERSEDED = "HISTORY_SEARCH_SUPERSEDED";
export function isPickerReadSuperseded(error: unknown): boolean {
  return (error instanceof Error ? error.message : String(error)) === PICKER_READ_SUPERSEDED;
}

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type SearchRequest = { mode?: string; appliedDescriptor?: unknown };

export function createPickerHistoryClient<Request extends SearchRequest, Page>(invoke: Invoke) {
  let session: Promise<number> | null = null;
  let generation = 0;
  const getSession = () => {
    if (!session) {
      const pending = invoke<number>("begin_picker_history_read_session").then((id) => {
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid history reader session");
        return id;
      });
      session = pending;
      void pending.catch(() => { if (session === pending) session = null; });
    }
    return session;
  };
  return {
    async search(request: Request): Promise<Page> {
      // Planning may have external/action effects: it is not a supersedable SQL read.
      if (request.mode === "ai" && !request.appliedDescriptor) {
        return invoke<Page>("history_search", { request });
      }
      const requestGeneration = ++generation; // before awaiting registration/IPC
      const currentSession = await getSession();
      return invoke<Page>("history_search", {
        request,
        pickerRead: { session: currentSession, generation: requestGeneration },
      });
    },
  };
}
