import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export type Diagnostic = {
  level: "error" | "warn";
  code: string;
  path: string;
  message: string;
};

export type ReferenceStatus = "external" | "existing" | "missing" | "unresolved-pattern" | "unsafe";

export type ContextTopic = {
  id: string;
  status: "active" | "reference" | "historical" | "archived" | "draft" | "deprecated";
  kind: string;
  triggers: string[];
  primary_refs: string[];
  summary?: string;
  aliases?: string[];
  excludes?: string[];
  path: string;
  references: Array<{ path: string; status: ReferenceStatus }>;
};

export type ContextSkill = {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, unknown>;
  "allowed-tools"?: string | string[];
  "disable-model-invocation"?: boolean;
  path: string;
};
export type ContextTrack = {
  path: string;
  title: string;
  status?: string;
  topic?: string;
  started?: string;
  updated?: string;
  priority?: string;
  owner?: string;
  related?: string[];
  source_refs?: string[];
  metadata: Record<string, unknown>;
};

export type ContextFocus = {
  state: string;
  plans: Array<{ path: string; batch?: string }>;
  references: string[];
  gate?: string;
  blockage?: string;
  nextAction?: string;
  selectedTrack?: string;
};

export type ContextSpec = {
  path: string;
  name: string;
  active: boolean;
  entries: string[];
  metadata: Record<string, unknown>;
};

export type ContextOperation = { name: string; command: string };

export type ContextCatalog = {
  root: string;
  topics: ContextTopic[];
  skills: ContextSkill[];
  focus: ContextFocus | null;
  tracks: ContextTrack[];
  specs: ContextSpec[];
  operations: ContextOperation[];
  diagnostics: Diagnostic[];
};

type AnyRecord = Record<string, unknown>;
const MAX_DOCUMENT_BYTES = 1024 * 1024;
const TOPIC_STATUSES: Record<string, true> = { active: true, reference: true, historical: true, archived: true, draft: true, deprecated: true };
const TOPIC_KEYS: Record<string, true> = { id: true, status: true, kind: true, triggers: true, primary_refs: true, summary: true, aliases: true, excludes: true };
const SKILL_KEYS: Record<string, true> = { name: true, description: true, license: true, compatibility: true, metadata: true, "allowed-tools": true, "disable-model-invocation": true };
const TOP_LEVEL_KEY = /^(?:([A-Za-z_][A-Za-z0-9_-]*)|"([A-Za-z_][A-Za-z0-9_-]*)"|'([A-Za-z_][A-Za-z0-9_-]*)'):(?:\s|$)/;

function addDiagnostic(
  diagnostics: Diagnostic[],
  level: Diagnostic["level"],
  code: string,
  path: string,
  message: string,
) {
  diagnostics.push({ level, code, path, message });
}


function inside(root: string, target: string) {
  const rel = relative(root, target);
  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
}

function hasSymlinkComponent(root: string, path: string, diagnostics: Diagnostic[]): boolean {
  const target = resolve(root, path);
  if (!inside(root, target)) {
    addDiagnostic(diagnostics, "error", "unsafe_path", path, "Path escapes the repository root");
    return true;
  }
  let current = root;
  for (const part of relative(root, target).split(/[\\/]/).filter(Boolean)) {
    current = resolve(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        addDiagnostic(diagnostics, "error", "symlink_path", path, "Context sources must not traverse symbolic links");
        return true;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      addDiagnostic(diagnostics, "error", "path_unreadable", path, "Context path could not be inspected");
      return true;
    }
  }
  return false;
}

function regularPath(root: string, relativePath: string, diagnostics: Diagnostic[], required = false): string | undefined {
  if (!relativePath || relativePath.includes("\0") || isAbsolute(relativePath)) {
    addDiagnostic(diagnostics, "error", "unsafe_path", relativePath || ".", "Path is not a safe repository-relative file");
    return undefined;
  }
  const lexical = resolve(root, relativePath);
  if (!inside(root, lexical)) {
    addDiagnostic(diagnostics, "error", "unsafe_path", relativePath, "Path escapes the repository root");
    return undefined;
  }
  if (hasSymlinkComponent(root, relativePath, diagnostics)) return undefined;
  if (!existsSync(lexical)) {
    if (required) addDiagnostic(diagnostics, "warn", "missing_reference", relativePath, "Referenced file is not available locally");
    return undefined;
  }
  try {
    if (!lstatSync(lexical).isFile()) {
      if (required) addDiagnostic(diagnostics, "warn", "not_regular_file", relativePath, "Referenced path is not a regular file");
      return undefined;
    }
    const real = realpathSync(lexical);
    if (!inside(root, real)) {
      addDiagnostic(diagnostics, "error", "symlink_escape", relativePath, "Referenced file resolves outside the repository root");
      return undefined;
    }
    return lexical;
  } catch {
    addDiagnostic(diagnostics, "error", "path_unreadable", relativePath, "Referenced path could not be inspected");
    return undefined;
  }
}

function readBounded(root: string, relativePath: string, diagnostics: Diagnostic[], required = false): string | undefined {
  const path = regularPath(root, relativePath, diagnostics, required);
  if (!path) return undefined;
  try {
    const size = statSync(path).size;
    if (size > MAX_DOCUMENT_BYTES) {
      addDiagnostic(diagnostics, "error", "document_too_large", relativePath, "Document exceeds the 1 MiB metadata read limit");
      return undefined;
    }
    return readFileSync(path, "utf8");
  } catch {
    addDiagnostic(diagnostics, "error", "read_failed", relativePath, "Document metadata could not be read");
    return undefined;
  }
}

function frontmatter(content: string): string | undefined {
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) return undefined;
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match?.[1];
}

function duplicateTopLevelKeys(source: string): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(TOP_LEVEL_KEY);
    if (!match) continue;
    const key = match[1] ?? match[2] ?? match[3];
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates];
}

function parseYaml(source: string, path: string, diagnostics: Diagnostic[]): AnyRecord | undefined {
  if (source.split(/\r?\n/).some((line) => /^\S/.test(line) && !line.startsWith("#") && !TOP_LEVEL_KEY.test(line))) {
    addDiagnostic(diagnostics, "error", "unsupported_yaml_key_syntax", path, "Metadata must use a block mapping with simple top-level keys");
    return undefined;
  }
  for (const key of duplicateTopLevelKeys(source)) {
    addDiagnostic(diagnostics, "error", "duplicate_key", path, `Metadata repeats top-level key ${key}`);
  }
  try {
    const parser = (globalThis as { Bun?: { YAML?: { parse: (value: string) => unknown } } }).Bun?.YAML?.parse;
    if (!parser) throw new Error("YAML parser unavailable");
    const value = parser(source);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("metadata is not a mapping");
    return value as AnyRecord;
  } catch {
    addDiagnostic(diagnostics, "error", "invalid_yaml", path, "Metadata YAML could not be parsed");
    return undefined;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) return undefined;
  return value.map((item) => (item as string).trim());
}

export function metadataForMarkdown(root: string, path: string, diagnostics: Diagnostic[], selectHeader?: (source: string) => boolean) {
  const content = readBounded(root, path, diagnostics, true);
  if (content === undefined) return undefined;
  const source = frontmatter(content);
  if (selectHeader && (!/^\uFEFF?---\r?\n/.test(content) || !selectHeader(source ?? content))) return undefined;
  if (source === undefined) {
    addDiagnostic(diagnostics, "error", "missing_frontmatter", path, "Markdown document has no valid frontmatter block");
    return undefined;
  }
  return { source, value: parseYaml(source, path, diagnostics), content };
}

export function referenceInfo(root: string, raw: string, diagnostics: Diagnostic[]): { path: string; status: ReferenceStatus } {
  const value = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\") || /^\.\.[\\/]/.test(value)) return { path: value, status: "external" };
  if (/[*?\[\]]/.test(value)) return { path: value, status: "unresolved-pattern" };
  if (!value || value.includes("\0")) return { path: value, status: "unsafe" };
  const target = resolve(root, value);
  if (!inside(root, target)) return { path: value, status: "unsafe" };
  if (hasSymlinkComponent(root, value, diagnostics)) return { path: value, status: "unsafe" };
  try {
    if (!existsSync(target)) return { path: value, status: "missing" };
    const real = realpathSync(target);
    if (!inside(root, real)) return { path: value, status: "unsafe" };
    if (statSync(target).isDirectory()) return { path: value, status: "unresolved-pattern" };
    return { path: value, status: "existing" };
  } catch {
    return { path: value, status: "unsafe" };
  }
}

function directoryPath(root: string, relativePath: string, diagnostics: Diagnostic[]): string | undefined {
  const lexical = resolve(root, relativePath);
  if (hasSymlinkComponent(root, relativePath, diagnostics)) return undefined;
  if (!existsSync(lexical)) return undefined;
  try {
    const real = realpathSync(lexical);
    if (!inside(root, real)) {
      addDiagnostic(diagnostics, "error", "symlink_escape", relativePath, "Context directory resolves outside the repository root");
      return undefined;
    }
    if (!statSync(lexical).isDirectory()) {
      addDiagnostic(diagnostics, "error", "not_directory", relativePath, "Context source is not a directory");
      return undefined;
    }
    return lexical;
  } catch {
    addDiagnostic(diagnostics, "error", "directory_unreadable", relativePath, "Context directory could not be inspected");
    return undefined;
  }
}

function listImmediateFiles(root: string, dir: string, suffix: string, diagnostics: Diagnostic[]): string[] {
  const path = directoryPath(root, dir, diagnostics);
  if (!path) return [];
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(suffix))
      .map((entry) => `${dir}/${entry.name}`.replaceAll("\\", "/"))
      .sort();
  } catch {
    addDiagnostic(diagnostics, "error", "directory_unreadable", dir, "Context source directory could not be read");
    return [];
  }
}

function walkTracks(root: string, dir: string, diagnostics: Diagnostic[]): string[] {
  const result: string[] = [];
  const visit = (relativeDir: string) => {
    const absolute = directoryPath(root, relativeDir, diagnostics);
    if (!absolute) return;
    let entries;
    try { entries = readdirSync(absolute, { withFileTypes: true }); } catch {
      addDiagnostic(diagnostics, "error", "directory_unreadable", relativeDir, "Track directory could not be read");
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const child = `${relativeDir}/${entry.name}`.replaceAll("\\", "/");
      if (entry.isDirectory() || entry.isSymbolicLink() && !entry.name.endsWith(".md")) visit(child);
      else if ((entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(".md")) result.push(child);
    }
  };
  visit(dir);
  return result.sort();
}

function parseTopic(root: string, path: string, diagnostics: Diagnostic[]): ContextTopic | undefined {
  const parsed = metadataForMarkdown(root, path, diagnostics);
  if (!parsed?.value) return undefined;
  const value = parsed.value;
  for (const key of Object.keys(value)) if (!Object.hasOwn(TOPIC_KEYS, key)) addDiagnostic(diagnostics, "error", "unknown_topic_key", path, `Topic metadata contains unsupported key ${key}`);
  const id = stringValue(value.id);
  const status = stringValue(value.status);
  const kind = stringValue(value.kind);
  const triggers = stringList(value.triggers);
  const primaryRefs = stringList(value.primary_refs);
  let valid = true;
  if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) { addDiagnostic(diagnostics, "error", "invalid_topic_id", path, "Topic id must be kebab-case"); valid = false; }
  if (!status || !Object.hasOwn(TOPIC_STATUSES, status)) { addDiagnostic(diagnostics, "error", "invalid_topic_status", path, "Topic status is not supported"); valid = false; }
  if (!kind) { addDiagnostic(diagnostics, "error", "invalid_topic_kind", path, "Topic kind must be non-empty"); valid = false; }
  if (!triggers?.length) { addDiagnostic(diagnostics, "error", "invalid_topic_triggers", path, "Topic triggers must be a non-empty string list"); valid = false; }
  if (!primaryRefs?.length) { addDiagnostic(diagnostics, "error", "invalid_topic_refs", path, "Topic primary_refs must be a non-empty string list"); valid = false; }
  const optionalLists: Array<[string, unknown]> = [["aliases", value.aliases], ["excludes", value.excludes]];
  for (const [name, list] of optionalLists) if (list !== undefined && !stringList(list)) { addDiagnostic(diagnostics, "error", "invalid_topic_list", path, `Topic ${name} must be a string list`); valid = false; }
  if (value.summary !== undefined && (!stringValue(value.summary) || (value.summary as string).trim().length > 500)) { addDiagnostic(diagnostics, "error", "invalid_topic_summary", path, "Topic summary must be non-empty and at most 500 characters"); valid = false; }
  if (!valid || !id || !status || !kind || !triggers || !primaryRefs) return undefined;
  const refs = primaryRefs.map((ref) => referenceInfo(root, ref, diagnostics));
  for (const ref of refs) if (ref.status === "missing") addDiagnostic(diagnostics, "warn", "missing_reference", path, `Topic reference is unavailable: ${ref.path}`);
  if (refs.some((ref) => ref.status === "unsafe")) addDiagnostic(diagnostics, "error", "unsafe_reference", path, "Topic contains a reference outside the repository root");
  return {
    id,
    status: status as ContextTopic["status"],
    kind,
    triggers,
    primary_refs: primaryRefs,
    ...(stringValue(value.summary) ? { summary: (value.summary as string).trim() } : {}),
    ...(stringList(value.aliases) ? { aliases: stringList(value.aliases) } : {}),
    ...(stringList(value.excludes) ? { excludes: stringList(value.excludes) } : {}),
    path,
    references: refs,
  };
}

function parseSkill(root: string, path: string, diagnostics: Diagnostic[]): ContextSkill | undefined {
  const parsed = metadataForMarkdown(root, path, diagnostics);
  if (!parsed?.value) return undefined;
  const value = parsed.value;
  const name = stringValue(value.name);
  const description = stringValue(value.description);
  if (!name || name.length > 64) addDiagnostic(diagnostics, "error", "invalid_skill_name", path, "Skill name must be non-empty and at most 64 characters");
  if (!description || description.length > 1024) addDiagnostic(diagnostics, "error", "invalid_skill_description", path, "Skill description must be non-empty and at most 1024 characters");
  for (const field of ["license", "compatibility"]) {
    if (value[field] !== undefined && (!stringValue(value[field]) || field === "compatibility" && (value[field] as string).length > 500)) {
      addDiagnostic(diagnostics, "error", "invalid_skill_field", path, `Skill ${field} must be a valid string`);
    }
  }
  const allowed = value["allowed-tools"] === undefined ? undefined : stringValue(value["allowed-tools"]) ?? stringList(value["allowed-tools"]);
  if (value["allowed-tools"] !== undefined && !allowed) addDiagnostic(diagnostics, "error", "invalid_skill_tools", path, "Skill allowed-tools must be a string or string list");
  const disableInvocation = value["disable-model-invocation"];
  if (disableInvocation !== undefined && typeof disableInvocation !== "boolean") addDiagnostic(diagnostics, "error", "invalid_skill_flag", path, "Skill disable-model-invocation must be boolean");
  if (!name || !description || (value["allowed-tools"] !== undefined && !allowed) || (disableInvocation !== undefined && typeof disableInvocation !== "boolean")) return undefined;
  const extension: AnyRecord = Object.create(null);
  for (const [key, item] of Object.entries(value)) if (!Object.hasOwn(SKILL_KEYS, key)) extension[key] = item;
  const metadata = value.metadata;
  if (metadata !== undefined && (!metadata || typeof metadata !== "object" || Array.isArray(metadata))) addDiagnostic(diagnostics, "error", "invalid_skill_metadata", path, "Skill metadata extension must be a mapping");
  const mergedMetadata =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as AnyRecord), ...extension }
      : Object.keys(extension).length ? extension : undefined;
  return {
    name,
    description,
    ...(stringValue(value.license) ? { license: stringValue(value.license) } : {}),
    ...(stringValue(value.compatibility) ? { compatibility: stringValue(value.compatibility) } : {}),
    ...(mergedMetadata ? { metadata: mergedMetadata } : {}),
    ...(allowed ? { "allowed-tools": allowed } : {}),
    ...(typeof disableInvocation === "boolean" ? { "disable-model-invocation": disableInvocation } : {}),
    path,
  };
}

function parseTrack(root: string, path: string, diagnostics: Diagnostic[]): ContextTrack | undefined {
  const content = readBounded(root, path, diagnostics, true);
  if (content === undefined) return undefined;
  const source = frontmatter(content);
  const title = content.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim() ?? path.split("/").at(-1)?.replace(/\.md$/, "") ?? "Untitled";
  if (source === undefined) return { path, title, metadata: {} };
  const value = parseYaml(source, path, diagnostics);
  if (!value) return { path, title, metadata: {} };
  const metadata: AnyRecord = { ...value };
  const listFields: Array<[string, unknown]> = [["related", value.related], ["source_refs", value.source_refs]];
  for (const [field, list] of listFields) if (list !== undefined && !stringList(list)) addDiagnostic(diagnostics, "error", "invalid_track_list", path, `Track ${field} must be a string list`);
  for (const ref of [...(stringList(value.related) ?? []), ...(stringList(value.source_refs) ?? [])]) {
    const info = referenceInfo(root, ref, diagnostics);
    if (info.status === "missing") addDiagnostic(diagnostics, "warn", "missing_reference", path, `Track reference is unavailable: ${info.path}`);
  }
  return {
    path, title,
    ...(stringValue(value.status) ? { status: stringValue(value.status) } : {}),
    ...(stringValue(value.topic) ? { topic: stringValue(value.topic) } : {}),
    ...(stringValue(value.started) ? { started: stringValue(value.started) } : {}),
    ...(stringValue(value.updated) ? { updated: stringValue(value.updated) } : {}),
    ...(stringValue(value.priority) ? { priority: stringValue(value.priority) } : {}),
    ...(stringValue(value.owner) ? { owner: stringValue(value.owner) } : {}),
    ...(stringList(value.related) ? { related: stringList(value.related) } : {}),
    ...(stringList(value.source_refs) ? { source_refs: stringList(value.source_refs) } : {}),
    metadata,
  };
}

function parseFocus(root: string, diagnostics: Diagnostic[]): ContextFocus | null {
  const path = "docs/WORKING_MEMORY.md";
  const content = readBounded(root, path, diagnostics);
  if (content === undefined) return null;
  const heading = "## Foco Único De Ejecución";
  const start = content.indexOf(heading);
  if (start < 0) { addDiagnostic(diagnostics, "error", "missing_focus", path, "Working Memory focus section is missing"); return null; }
  const tail = content.slice(start + heading.length);
  const end = tail.search(/\r?\n##\s/);
  const section = (end >= 0 ? tail.slice(0, end) : tail);
  const lines: string[] = [];
  for (const line of section.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const prev = lines.at(-1);
    if (/^\s+\S/.test(line) && prev && /^- \*\*(Próximo batch|Bloqueo|Gate|Siguiente acción):\*\*/.test(prev)) lines[lines.length - 1] = `${prev} ${line.trim()}`;
    else lines.push(line);
  }
  const state = lines.find((line) => line.startsWith("- **Estado:**"))?.match(/`([^`]+)`/)?.[1];
  if (!state) { addDiagnostic(diagnostics, "error", "invalid_focus", path, "Working Memory focus state is missing or malformed"); return null; }
  const plans: Array<{ path: string; batch?: string }> = [];
  for (let i = 0; i < lines.length; i += 1) {
    const plan = lines[i].match(/^- \*\*Plan:\*\* `([^`]+)`\./)?.[1];
    if (plan) plans.push({ path: plan, ...(lines[i + 1]?.match(/^- \*\*Próximo batch:\*\*\s+(.+)$/)?.[1] ? { batch: lines[i + 1].match(/^- \*\*Próximo batch:\*\*\s+(.+)$/)![1] } : {}) });
  }
  const references = [...lines].flatMap((line) => { const match = line.match(/^- \*\*Referencia:\*\* `([^`]+)`\./); return match ? [match[1]] : []; });
  const gate = lines.find((line) => line.startsWith("- **Gate:**"))?.replace(/^- \*\*Gate:\*\*\s*/, "");
  const blockage = lines.find((line) => line.startsWith("- **Bloqueo:**"))?.replace(/^- \*\*Bloqueo:\*\*\s*/, "");
  const nextAction = lines.find((line) => line.startsWith("- **Siguiente acción:**"))?.replace(/^- \*\*Siguiente acción:\*\*\s*/, "");
  const selectedTrack = [...plans.map((item) => item.path), ...references].find((item) => item.startsWith("docs/tracks/"));
  for (const selected of [...plans.map((item) => item.path), ...references]) {
    if (selected.startsWith("docs/tracks/") || selected.startsWith("specs/")) {
      if (hasSymlinkComponent(root, selected, diagnostics)) continue;
      const target = resolve(root, selected);
      if (!inside(root, target) || !existsSync(target)) addDiagnostic(diagnostics, "error", "invalid_focus_path", path, "Working Memory focus points to an unavailable path");
      else {
        try { if (!inside(root, realpathSync(target))) addDiagnostic(diagnostics, "error", "symlink_escape", path, "Working Memory focus path resolves outside the repository root"); } catch { addDiagnostic(diagnostics, "error", "path_unreadable", path, "Working Memory focus path could not be inspected"); }
      }
    } else addDiagnostic(diagnostics, "error", "invalid_focus_path", path, "Working Memory focus path is outside allowed docs/tracks and specs");
  }
  return { state, plans, references, ...(gate ? { gate } : {}), ...(blockage ? { blockage } : {}), ...(nextAction ? { nextAction } : {}), ...(selectedTrack ? { selectedTrack } : {}) };
}

function parseSpecs(root: string, diagnostics: Diagnostic[]): ContextSpec[] {
  const configPath = ".specify/feature.json";
  let activePath: string | undefined;
  const config = readBounded(root, configPath, diagnostics);
  if (config !== undefined) {
    try {
      const parsed = JSON.parse(config) as AnyRecord;
      if (typeof parsed.feature_directory === "string" && parsed.feature_directory.trim()) activePath = resolve(root, parsed.feature_directory);
      else if (parsed.feature_directory !== null && parsed.feature_directory !== undefined) addDiagnostic(diagnostics, "error", "invalid_spec_config", configPath, "feature_directory must be a path or null");
    } catch { addDiagnostic(diagnostics, "error", "invalid_spec_config", configPath, "Specification configuration is not valid JSON"); }
  }
  const roots = ["specs", ".specify/specs"].filter((dir) => !!directoryPath(root, dir, diagnostics));
  const result: ContextSpec[] = [];
  for (const sourceRoot of roots) {
    let entries;
    try { entries = readdirSync(resolve(root, sourceRoot), { withFileTypes: true }); } catch { addDiagnostic(diagnostics, "error", "directory_unreadable", sourceRoot, "Specification directory could not be read"); continue; }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const path = `${sourceRoot}/${entry.name}`;
      const absolute = resolve(root, path);
      let real = absolute;
      try { real = realpathSync(absolute); } catch { addDiagnostic(diagnostics, "error", "path_unreadable", path, "Specification directory could not be inspected"); continue; }
      if (!inside(root, real)) { addDiagnostic(diagnostics, "error", "symlink_escape", path, "Specification directory resolves outside the repository root"); continue; }
      let children: string[] = [];
      try { children = readdirSync(absolute, { withFileTypes: true }).filter((item) => item.isFile()).map((item) => item.name).sort(); } catch { addDiagnostic(diagnostics, "error", "directory_unreadable", path, "Specification directory could not be read"); }
      result.push({ path, name: entry.name, active: !!activePath && resolve(root, path) === activePath, entries: children, metadata: {} });
    }
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

function parseOperations(root: string, diagnostics: Diagnostic[]): ContextOperation[] {
  const content = readBounded(root, "package.json", diagnostics);
  if (content === undefined) return [];
  try {
    const parsed = JSON.parse(content) as AnyRecord;
    if (!parsed.scripts || typeof parsed.scripts !== "object" || Array.isArray(parsed.scripts)) return [];
    return Object.entries(parsed.scripts as AnyRecord).filter(([, value]) => typeof value === "string").map(([name, command]) => ({ name, command: command as string })).sort((a, b) => a.name.localeCompare(b.name));
  } catch { addDiagnostic(diagnostics, "error", "invalid_package", "package.json", "package.json is not valid JSON"); return []; }
}

export function loadContextCatalog(root: string, options: { allTracks?: boolean; track?: string; focus?: boolean } = {}): ContextCatalog {
  const diagnostics: Diagnostic[] = [];
  let canonicalRoot = resolve(root || ".");
  try { canonicalRoot = realpathSync(canonicalRoot); } catch { addDiagnostic(diagnostics, "error", "root_unreadable", ".", "Context root could not be resolved"); }
  const topicPaths = listImmediateFiles(canonicalRoot, "docs/topics", ".md", diagnostics);
  const topics: ContextTopic[] = [];
  const ids = new Map<string, string>();
  for (const path of topicPaths) {
    const topic = parseTopic(canonicalRoot, path, diagnostics);
    if (!topic) continue;
    if (ids.has(topic.id)) { addDiagnostic(diagnostics, "error", "duplicate_topic_id", path, `Topic id duplicates ${ids.get(topic.id)}`); continue; }
    ids.set(topic.id, path);
    topics.push(topic);
  }
  const skills: ContextSkill[] = [];
  const skillRoot = directoryPath(canonicalRoot, "docs/skills", diagnostics);
  if (skillRoot) {
    try {
      for (const entry of readdirSync(skillRoot, { withFileTypes: true })) {
        if ((!entry.isDirectory() && !entry.isSymbolicLink()) || entry.name.startsWith(".")) continue;
        const skillDir = `docs/skills/${entry.name}`;
        if (!directoryPath(canonicalRoot, skillDir, diagnostics)) continue;
        const path = `${skillDir}/SKILL.md`;
        const skill = parseSkill(canonicalRoot, path, diagnostics);
        if (skill) skills.push(skill);
      }
    } catch { addDiagnostic(diagnostics, "error", "directory_unreadable", "docs/skills", "Skills directory could not be read"); }
  }
  const focus = options.focus === false ? null : parseFocus(canonicalRoot, diagnostics);
  const trackPaths = new Set(options.allTracks
    ? walkTracks(canonicalRoot, "docs/tracks", diagnostics)
    : [...(focus?.plans.map((plan) => plan.path) ?? []), ...(focus?.references ?? [])].filter((path) => path.startsWith("docs/tracks/")));
  if (options.track) {
    const requested = options.track.replaceAll("\\", "/");
    const relativeTrack = requested.replace(/^docs\/tracks\//, "");
    if (requested.includes("\0") || isAbsolute(requested) || relativeTrack.split("/").some((part) => !part || part.startsWith(".") || part.includes(":"))) {
      addDiagnostic(diagnostics, "error", "invalid_track_path", ".", "Track selection must be an id or a path under docs/tracks");
    } else {
      const name = requested.replace(/\.md$/, "");
      const paths = name.startsWith("docs/tracks/")
        ? [`${name}.md`]
        : [`docs/tracks/${name}.md`, ...(!name.includes("/") ? [`docs/tracks/archive/${name}.md`] : [])];
      for (const path of paths) if (existsSync(resolve(canonicalRoot, path))) trackPaths.add(path);
    }
  }
  const tracks = [...trackPaths].filter((path) => !path.endsWith("/README.md") && !path.endsWith("/TEMPLATE.md")).flatMap((path) => { const track = parseTrack(canonicalRoot, path, diagnostics); return track ? [track] : []; });
  for (const track of tracks) if (track.topic && !ids.has(track.topic)) addDiagnostic(diagnostics, "warn", "missing_topic", track.path, "Track topic id is not present in the topic catalog");
  const specs = parseSpecs(canonicalRoot, diagnostics);
  const operations = parseOperations(canonicalRoot, diagnostics);
  topics.sort((a, b) => a.id.localeCompare(b.id));
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return { root: canonicalRoot, topics, skills, focus, tracks, specs, operations, diagnostics };
}
