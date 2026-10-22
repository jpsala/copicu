import { expect, test } from "bun:test";
import { createPickerHistoryClient, isPickerReadSuperseded, PICKER_READ_SUPERSEDED } from "../src/shared/pickerHistoryReader";

type Request = { query: string; mode?: string; appliedDescriptor?: unknown };
type Call = { command: string; args?: Record<string, unknown> };

test("picker registers once and assigns generations before awaiting registration", async () => {
  const calls: Call[] = [];
  let resolveSession!: (id: number) => void;
  const registration = new Promise<number>((resolve) => { resolveSession = resolve; });
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ command, args });
    return (command === "begin_picker_history_read_session" ? await registration : { ok: true }) as T;
  };
  const client = createPickerHistoryClient<Request, { ok: boolean }>(invoke);
  const first = client.search({ query: "one" });
  const second = client.search({ query: "two" });
  expect(calls.map(c => c.command)).toEqual(["begin_picker_history_read_session"]);
  resolveSession(7);
  await Promise.all([first, second]);
  expect(calls.slice(1).map(c => c.args?.pickerRead)).toEqual([
    { session: 7, generation: 1 }, { session: 7, generation: 2 },
  ]);
  await client.search({ query: "three" });
  expect(calls.at(-1)?.args?.pickerRead).toEqual({ session: 7, generation: 3 });
  expect(calls.filter(c => c.command === "begin_picker_history_read_session")).toHaveLength(1);
});

test("registration failure is visible and retry registers again without issuing stale SQL", async () => {
  const calls: Call[] = [];
  let registrations = 0;
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ command, args });
    if (command === "begin_picker_history_read_session") {
      if (++registrations === 1) throw new Error("synthetic registration failure");
      return 8 as T;
    }
    return {} as T;
  };
  const client = createPickerHistoryClient<Request, object>(invoke);
  await expect(client.search({ query: "one" })).rejects.toThrow("synthetic registration failure");
  expect(calls.filter(c => c.command === "history_search")).toHaveLength(0);
  await client.search({ query: "two" });
  expect(calls.at(-1)?.args?.pickerRead).toEqual({ session: 8, generation: 2 });
});

test("fresh renderer client gets a new host session; AI planning never enters supersedable SQL", async () => {
  const calls: Call[] = [];
  let session = 0;
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ command, args });
    return (command === "begin_picker_history_read_session" ? ++session : {}) as T;
  };
  const first = createPickerHistoryClient<Request, object>(invoke);
  await first.search({ query: "plan this", mode: "ai" });
  expect(calls).toEqual([{ command: "history_search", args: { request: { query: "plan this", mode: "ai" } } }]);
  await first.search({ query: "planned", mode: "ai", appliedDescriptor: { fingerprint: "synthetic" } });
  expect(calls.at(-1)?.args?.pickerRead).toEqual({ session: 1, generation: 1 });
  const second = createPickerHistoryClient<Request, object>(invoke);
  await second.search({ query: "new renderer" });
  expect(calls.at(-1)?.args?.pickerRead).toEqual({ session: 2, generation: 1 });
});

test("malformed host session fails closed and supersession is not a generic SQL error", async () => {
  const client = createPickerHistoryClient<Request, object>(async <T>() => null as T);
  await expect(client.search({ query: "test" })).rejects.toThrow("Invalid history reader session");
  expect(isPickerReadSuperseded(PICKER_READ_SUPERSEDED)).toBe(true);
  expect(isPickerReadSuperseded(new Error(PICKER_READ_SUPERSEDED))).toBe(true);
  expect(isPickerReadSuperseded(`SQL failure: ${PICKER_READ_SUPERSEDED}`)).toBe(false);
});
