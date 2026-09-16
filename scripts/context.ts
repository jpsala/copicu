import { loadContextCatalog, type ContextCatalog, type Diagnostic } from "./lib/context-catalog.ts";
import { queryContext, rankSkills } from "./lib/context-router.ts";

type ParsedArgs = { command: string; argument?: string; json: boolean; root: string };
type Envelope = { schemaVersion: 1; command: string; status: string; data: unknown; diagnostics: Diagnostic[] };

const COMMANDS: Record<string, true> = { show: true, query: true, topics: true, skills: true, focus: true, track: true, specs: true, operations: true, help: true, audit: true };

function usage(): string {
  return [
    "Usage: bun scripts/context.ts [command] [query-or-id] [--json] [--root PATH]",
    "Commands: show, query, topics, skills, focus, track, specs, operations, help, audit",
    "Default command: show. Queries are read-only and use fresh metadata on every invocation.",
  ].join("\n");
}

function parseArgs(args: string[]): ParsedArgs | { error: string } {
  let command = "show";
  let commandSeen = false;
  let argument: string | undefined;
  let json = false;
  let root = process.cwd();
  let rootSeen = false;
  let help = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help") {
      if (help) return { error: "Duplicate --help" };
      help = true;
      continue;
    }
    if (arg === "--json") {
      if (json) return { error: "Duplicate --json" };
      json = true;
      continue;
    }
    if (arg === "--root") {
      if (rootSeen) return { error: "Duplicate --root" };
      rootSeen = true;
      const value = args[index + 1];
      if (!value || value.startsWith("-")) return { error: "--root requires a path" };
      root = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) return { error: `Unknown flag: ${arg}` };
    if (!commandSeen) {
      command = arg;
      commandSeen = true;
      if (!Object.hasOwn(COMMANDS, command)) return { error: `Unknown command: ${command}` };
      continue;
    }
    if (argument !== undefined) return { error: "Too many positional arguments" };
    argument = arg;
  }
  const needsArgument = command === "query" || command === "track";
  if (needsArgument && !argument && !help) return { error: `${command} requires a query or id` };
  if (!needsArgument && argument !== undefined && command !== "skills") return { error: `${command} does not accept a positional argument` };
  return { command: help ? "help" : command, argument: help ? undefined : argument, json, root };
}

function statusFromDiagnostics(diagnostics: Diagnostic[]): "resolved" | "invalid_metadata" {
  return diagnostics.some((diagnostic) => diagnostic.level === "error") ? "invalid_metadata" : "resolved";
}

function showData(catalog: ContextCatalog) {
  return {
    root: catalog.root,
    topics: catalog.topics.map((topic) => ({ id: topic.id, status: topic.status, kind: topic.kind, path: topic.path })),
    focus: catalog.focus,
    trackCount: catalog.tracks.length,
    specCount: catalog.specs.length,
    skillCount: catalog.skills.length,
    operationCount: catalog.operations.length,
  };
}

function trackData(catalog: ContextCatalog, query: string) {
  const normalized = query.replaceAll("\\", "/").replace(/\.md$/, "");
  const matches = catalog.tracks.filter((track) => {
    const path = track.path.replace(/\.md$/, "");
    return path === normalized || path.replace(/^docs\/tracks\//, "") === normalized || path.split("/").at(-1) === normalized;
  });
  if (matches.length === 1) return { status: "resolved", data: matches[0] };
  if (matches.length > 1) return { status: "ambiguous", data: { matches } };
  return { status: "no_match", data: null };
}

function humanOutput(command: string, status: string, data: unknown, diagnostics: Diagnostic[], root: string): string {
  const objectData: Record<string, unknown> =
    data !== null && typeof data === "object" && !Array.isArray(data)
      ? data as Record<string, unknown>
      : {};
  const lines: string[] = [
    `Root: ${root}`,
    `Status: ${status}`,
  ];
  if (command === "show") {
    const topics = Array.isArray(objectData.topics) ? objectData.topics : [];
    lines.push(
      `Topics: ${topics.length}`,
      `Skills: ${String(objectData.skillCount ?? 0)}`,
      `Focused tracks: ${String(objectData.trackCount ?? 0)}`,
      `Specs: ${String(objectData.specCount ?? 0)}`,
      `Operations: ${String(objectData.operationCount ?? 0)}`,
    );
    const focus = objectData.focus;
    if (focus && typeof focus === "object" && !Array.isArray(focus)) {
      const focusRecord = focus as Record<string, unknown>;
      lines.push(
        `Focus: ${String(focusRecord.state ?? "unknown")}${focusRecord.selectedTrack ? ` (${String(focusRecord.selectedTrack)})` : ""}`,
      );
    } else {
      lines.push("Focus: unavailable");
    }
  } else if (command === "query") {
    const candidates = Array.isArray(objectData.candidates) ? objectData.candidates : [];
    for (const candidate of candidates) {
      const value = candidate as { id: string; score: number; topic: { path: string; status: string }; matched: Array<{ field: string; reason: string; value: string }> };
      lines.push(`- ${value.id} (${value.topic.path}; ${value.topic.status}; score ${value.score})`);
      for (const match of value.matched) lines.push(`  ${match.field}/${match.reason}: ${match.value}`);
    }
    if (status === "no_match") lines.push("No matching route. Refine the query or inspect topic metadata.");
    if (status === "ambiguous") lines.push("No route selected. Clarify the intended area before reading a candidate.");
    const selected = objectData.selected as { id: string; references?: Array<{ path: string; status: string }> } | null;
    if (selected) lines.push(`Selected: ${selected.id}`);
    for (const reference of selected?.references?.slice(0, 6) ?? []) {
      lines.push(reference.status === "existing"
        ? `  Read next: ${reference.path}`
        : `  Reference (${reference.status}): ${reference.path}`);
    }
    for (const exclusion of (objectData.exclusions ?? []) as Array<{ id: string; reason: string }>) lines.push(`  Excluded ${exclusion.id}: ${exclusion.reason}`);
  } else if (command === "topics") {
    for (const topic of Array.isArray(data) ? data : []) {
      if (topic && typeof topic === "object") {
        const value = topic as Record<string, unknown>;
        lines.push(`- ${String(value.status ?? "unknown")}: ${String(value.id ?? "")} (${String(value.path ?? "")})`);
      }
    }
  } else if (command === "skills") {
    for (const skill of Array.isArray(data) ? data : []) {
      if (skill && typeof skill === "object") {
        const value = skill as Record<string, unknown>;
        const nested =
          value.skill && typeof value.skill === "object"
            ? value.skill as Record<string, unknown>
            : value;
        lines.push(`- ${String(value.name ?? nested.name ?? "")}: ${String(nested.description ?? "")}`);
      }
    }
  } else if (command === "focus") {
    lines.push(data ? JSON.stringify(data) : "- unavailable");
  } else if (command === "track") {
    lines.push(data ? JSON.stringify(data) : "- no matching track");
  } else if (command === "specs") {
    for (const spec of Array.isArray(data) ? data : []) {
      if (spec && typeof spec === "object") {
        const value = spec as Record<string, unknown>;
        lines.push(`- ${value.active ? "active" : "historical"}: ${String(value.name ?? "")} (${String(value.path ?? "")})`);
      }
    }
  } else if (command === "operations") {
    for (const operation of Array.isArray(data) ? data : []) {
      if (operation && typeof operation === "object") {
        const value = operation as Record<string, unknown>;
        lines.push(`- ${String(value.name ?? "")}: ${String(value.command ?? "")}`);
      }
    }
  } else if (command === "audit") {
    lines.push(`Diagnostics: ${diagnostics.length}`);
  }
  if (diagnostics.length) {
    lines.push(...diagnostics.map((diagnostic) => `- ${diagnostic.level} ${diagnostic.code} ${diagnostic.path}: ${diagnostic.message}`));
  }
  return lines.join("\n");
}

export function runContextCli(loadCatalog: typeof loadContextCatalog = loadContextCatalog): number {
  const parsed = parseArgs(process.argv.slice(2));
  if ("error" in parsed) {
    if (process.argv.includes("--json")) console.log(JSON.stringify({ schemaVersion: 1, command: null, status: "usage_error", data: { error: parsed.error, usage: usage() }, diagnostics: [] }));
    else console.error(`${parsed.error}\n${usage()}`);
    return 2;
  }
  if (parsed.command === "help") { if (parsed.json) console.log(JSON.stringify({ schemaVersion: 1, command: "help", status: "resolved", data: { usage: usage() }, diagnostics: [] })); else console.log(usage()); return 0; }
  const catalog = loadCatalog(parsed.root, { allTracks: parsed.command === "audit", ...(parsed.command === "track" ? { track: parsed.argument } : {}) });
  let status: string = statusFromDiagnostics(catalog.diagnostics);
  let data: unknown;
  if (parsed.command === "show") data = showData(catalog);
  else if (parsed.command === "query") {
    const result = queryContext(catalog, parsed.argument ?? "");
    status = result.status;
    data = result;
  } else if (parsed.command === "topics") data = catalog.topics;
  else if (parsed.command === "skills") data = parsed.argument ? rankSkills(catalog, parsed.argument) : catalog.skills;
  else if (parsed.command === "focus") data = catalog.focus;
  else if (parsed.command === "track") { const selected = trackData(catalog, parsed.argument ?? ""); status = selected.status; data = selected.data; }
  else if (parsed.command === "specs") data = catalog.specs;
  else if (parsed.command === "operations") data = catalog.operations;
  else data = { root: catalog.root, counts: { topics: catalog.topics.length, skills: catalog.skills.length, tracks: catalog.tracks.length, specs: catalog.specs.length, operations: catalog.operations.length }, diagnostics: catalog.diagnostics };
  if (catalog.diagnostics.some((diagnostic) => diagnostic.level === "error")) status = "invalid_metadata";
  const envelope: Envelope = { schemaVersion: 1, command: parsed.command, status, data, diagnostics: catalog.diagnostics };
  if (parsed.json) console.log(JSON.stringify(envelope, null, 2));
  else console.log(humanOutput(parsed.command, status, data, catalog.diagnostics, catalog.root));
  return status === "invalid_metadata" ? 1 : 0;
}

if (import.meta.main) process.exitCode = runContextCli();
