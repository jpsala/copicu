// Consultor OS2 local: adaptación mínima del contrato de metadata, sin runtime,
// Working Memory, scoring, índices, red ni dependencia de otro checkout.
import { closeSync, fstatSync, lstatSync, openSync, readdirSync, readSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export type Kind = "tracks" | "topics";
export type Entry = {
  id: string; path: string; kind: Kind; title: string; summary: string;
  status?: string; last_worked?: string | null; next?: string;
  topics?: string[]; keywords?: string[];
};
export type Catalog = { entries: Entry[]; errors: string[] };
const states = ["active", "paused", "closed"];
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const help = `Uso: bun run knowledge -- <comando> [--json]
  tracks [active|paused|closed]  Metadata de trabajos
  topics                        Metadata de conocimiento
  search "texto"                Candidatos por metadata, no por cuerpo
  last                          Última UTC de trabajo acreditada (incluye empates)
  check                         Metadata y referencias track→topic
Sin escrituras, índices ni harness. Abrir después la fuente pertinente.
null en imports no niega trabajo histórico; no se infiere fecha desde mtime.`;

// No seguir junctions/symlinks ni resolver fuentes fuera del repo.
export function localPath(root: string, path: string): string {
  if (!path || path.includes("\0") || isAbsolute(path)) throw new Error("ruta relativa local requerida");
  const target = resolve(root, path);
  const rel = relative(resolve(root), target);
  if (!rel || rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(rel)) throw new Error("ruta fuera del repo");
  let current = resolve(root);
  for (const part of rel.split(/[\\/]/)) {
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error("fuentes locales sin symlinks/junctions");
  }
  return target;
}

export function readMetadata(root: string, path: string): Record<string, unknown> {
  const fd = openSync(localPath(root, path), "r");
  const chunks: Buffer[] = [];
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error("archivo regular requerido");
    for (let size = 0; size < 16384; size += 1024) {
      const buffer = Buffer.alloc(1024);
      const count = readSync(fd, buffer, 0, buffer.length, null);
      chunks.push(buffer.subarray(0, count));
      const text = Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "");
      const m = text.match(size + count >= stat.size
        ? /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
        : /^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
      if (m) {
        const keys = new Set<string>();
        for (const line of m[1].split(/\r?\n/)) {
          if (!line.trim() || /^\s|^#/.test(line)) continue;
          const key = line.match(/^([a-z_][a-z0-9_-]*):(?:\s|$)/)?.[1];
          if (!key) throw new Error("claves YAML simples, una por línea");
          if (keys.has(key)) throw new Error(`campo duplicado: ${key}`);
          keys.add(key);
        }
        const value = Bun.YAML.parse(m[1]);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("metadata debe ser un mapa YAML");
        return value as Record<string, unknown>;
      }
      if (count < buffer.length) break;
    }
    throw new Error("frontmatter ausente, incompleto o mayor a 16 KiB");
  } finally { closeSync(fd); }
}
export function oneLine(value: unknown): value is string {
  return typeof value === "string" && !!value.trim() && !/[\r\n]/.test(value);
}
function list(value: unknown): value is string[] { return Array.isArray(value) && value.every(oneLine); }
function utc(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().replace(".000Z", "Z") === value;
}
function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function catalog(root: string, kinds: Kind[] = ["tracks", "topics"]): Catalog {
  const result: Catalog = { entries: [], errors: [] };
  for (const kind of kinds) {
    try {
      const dir = localPath(root, `docs/${kind}`);
      if (!lstatSync(dir).isDirectory()) throw new Error("carpeta local requerida");
      for (const file of readdirSync(dir, { withFileTypes: true })) {
        if (file.name.startsWith(".") || ["README.md", "TEMPLATE.md"].includes(file.name)) continue;
        const path = `docs/${kind}/${file.name}`;
        try {
          if (!file.isFile() || !file.name.endsWith(".md")) throw new Error("Markdown plano, sin subcarpetas/enlaces");
          const id = file.name.slice(0, -3);
          if (!slug.test(id)) throw new Error("nombre debe ser kebab-case");
          const m = readMetadata(root, path);
          const allowed = kind === "tracks" ? ["title", "summary", "status", "last_worked", "next", "topics"] : ["title", "summary", "keywords"];
          for (const key of Object.keys(m)) if (!allowed.includes(key)) throw new Error(`campo desconocido: ${key}`);
          if (!oneLine(m.title) || !oneLine(m.summary)) throw new Error("title/summary requieren una línea no vacía");
          if (kind === "tracks") {
            if (typeof m.status !== "string" || !states.includes(m.status)) throw new Error("status debe ser active, paused o closed");
            if (m.last_worked !== null && !utc(m.last_worked)) throw new Error("last_worked requiere UTC real o null; explicar fecha histórica desconocida en el cuerpo");
            if (m.next !== undefined && !oneLine(m.next) || m.status !== "closed" && !oneLine(m.next)) throw new Error("next requiere una línea salvo en closed");
            if (m.topics !== undefined && (!list(m.topics) || !m.topics.every(id => slug.test(id)))) throw new Error("topics requiere IDs kebab-case");
          } else if (!list(m.keywords) || !m.keywords.length) throw new Error("keywords requiere lista no vacía");
          result.entries.push({ ...m, id, path, kind } as Entry);
        } catch (error) { result.errors.push(`${path}: ${(error as Error).message}`); }
      }
    } catch (error) { result.errors.push(`docs/${kind}: ${(error as Error).message}`); }
  }
  result.entries.sort((a, b) => a.path.localeCompare(b.path));
  return result;
}

export function query(root: string, args: string[]): { code: number; output: string } {
  const json = args.includes("--json");
  const positional = args.filter(arg => arg !== "--json");
  const [command = "help", argument] = positional;
  if (!["help", "tracks", "topics", "search", "last", "check"].includes(command)
    || args.filter(arg => arg === "--json").length > 1 || positional.length > 2
    || argument !== undefined && !["tracks", "search"].includes(command)
    || command === "tracks" && argument !== undefined && !states.includes(argument)
    || command === "search" && (!argument || !normalize(argument))) {
    return { code: 2, output: json ? JSON.stringify({ error: "Argumentos inválidos", help }) : `Argumentos inválidos.\n${help}` };
  }
  if (command === "help") return { code: 0, output: json ? JSON.stringify({ help }) : help };
  const kinds: Kind[] = ["tracks", "last"].includes(command) ? ["tracks"] : command === "topics" ? ["topics"] : ["tracks", "topics"];
  const { entries, errors } = catalog(root, kinds);
  let selected = entries;
  if (command === "tracks" && argument) selected = entries.filter(e => e.status === argument);
  if (command === "search") {
    const terms = normalize(argument!).split(/\s+/);
    selected = entries.filter(e => terms.every(term => normalize([e.id, e.title, e.summary, ...(e.keywords ?? []), ...(e.topics ?? [])].join(" ")).includes(term)));
  }
  if (command === "last") {
    const latest = entries.flatMap(e => e.last_worked ? [e.last_worked] : []).sort().at(-1);
    selected = latest ? entries.filter(e => e.last_worked === latest) : [];
  }
  if (command === "check") {
    const topics = new Set(entries.filter(e => e.kind === "topics").map(e => e.id));
    for (const e of entries) for (const topic of e.topics ?? []) if (!topics.has(topic)) errors.push(`${e.path}: topic inexistente: ${topic}`);
    selected = [];
  }
  const status = errors.length ? "invalid_metadata" : command === "check" || selected.length ? "ok" : "no_match";
  const output = json ? JSON.stringify({ status, entries: selected, errors }, null, 2) : [
    ...(command === "check" ? [`${errors.length ? "Validación fallida" : "Metadata válida"}: ${entries.length} documentos.`]
      : selected.length ? selected.map(e => `${e.kind === "tracks" ? `[${e.status}] ` : ""}${e.title} — ${e.path}\n  ${e.summary}${e.last_worked ? `\n  UTC acreditada: ${e.last_worked}` : ""}${e.next ? `\n  Próximo: ${e.next}` : ""}`)
      : [command === "last" ? "Sin fecha UTC de trabajo registrada." : "Sin resultados."]),
    ...errors.map(error => `ERROR: ${error}`),
  ].join("\n");
  return { code: errors.length ? 1 : 0, output };
}
if (import.meta.main) {
  const result = query(process.cwd(), process.argv.slice(2));
  console.log(result.output);
  process.exitCode = result.code;
}
