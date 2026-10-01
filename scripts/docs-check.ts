// Check documental local y read-only. No exige ni opera un harness/discovery.
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { catalog, localPath, oneLine, readMetadata } from "./knowledge.ts";

export type Finding = { level: "error" | "warn"; path: string; message: string };
// Contrato de glosario OS2, aplicado localmente para CI sin checkout vecino.
// Excluir ejemplos y comentarios; no es un parser Markdown completo.
function prose(source: string): string {
  let fence: { char: string; length: number } | undefined;
  return source.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/).filter(line => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      return false;
    }
    if (marker) { fence = { char: marker[1][0], length: marker[1].length }; return false; }
    return !/^(?: {4}|\t)/.test(line);
  }).join("\n").replace(/(`+)[^`\n]*?\1/g, "");
}
export function audit(root: string): Finding[] {
  const findings: Finding[] = [];
  const add = (level: Finding["level"], path: string, message: string) => findings.push({ level, path, message });
  const c = catalog(root);
  for (const error of c.errors) add("error", "docs", error);
  const topics = new Set(c.entries.filter(e => e.kind === "topics").map(e => e.id));
  for (const e of c.entries) for (const topic of e.topics ?? []) if (!topics.has(topic)) add("error", e.path, `topic inexistente: ${topic}`);
  if (!topics.size) add("error", "docs/topics", "no hay topics documentados");

  function body(path: string, max = 25000): string | undefined {
    try {
      const absolute = localPath(root, path);
      const stat = lstatSync(absolute);
      if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error("Markdown regular de hasta 2 MiB requerido");
      const content = readFileSync(absolute, "utf8");
      if (content.length > max) add("warn", path, `documento largo (${content.length} caracteres); recuperar por secciones`);
      return content;
    } catch (error) { add("error", path, (error as Error).message); return undefined; }
  }
  function links(path: string, content: string) {
    // Sólo destinos inline simples, no URLs/anclas ni código de ejemplos.
    const plain = content.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, "").replace(/(`+)[^\n]*?\1/g, "");
    for (const m of plain.matchAll(/\[[^\]\n]+\]\(([^\s)]+)\)/g)) {
      const raw = m[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(raw)) continue;
      try {
        const target = decodeURIComponent(raw.split("#", 1)[0]);
        if (!target) continue;
        const destination = relative(resolve(root), resolve(root, dirname(path), target));
        localPath(root, destination);
      } catch (error) { add("error", path, `destino relativo inválido ${raw}: ${(error as Error).message}`); }
    }
  }
  for (const [path, max] of [["AGENTS.md", 6000], ["docs/README.md", 6000]] as const) {
    const content = body(path, max);
    if (content !== undefined) links(path, content);
  }
  const glossary = body("docs/topics/glossary.md");
  if (glossary !== undefined) {
    const plain = prose(glossary.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, ""));
    const heading = /^## Distinciones imprescindibles[ \t]*\r?$/m.exec(plain);
    const section = heading ? plain.slice(heading.index + heading[0].length).split(/^#{1,2} /m)[0] : "";
    if (!section.trim()) add("error", "docs/topics/glossary.md", "falta sección no vacía: Distinciones imprescindibles");
  }
  const instructions = body("AGENTS.md", Number.MAX_SAFE_INTEGER);
  if (instructions !== undefined && !/\[[^\]\n]+\]\((?:\.\/)?docs\/topics\/glossary\.md(?:#[^\s)]+)?\)/.test(prose(instructions))) {
    add("error", "AGENTS.md", "falta referencia Markdown directa al glosario local");
  }
  for (const e of c.entries) {
    const content = body(e.path, e.kind === "tracks" ? 50000 : 30000);
    if (content !== undefined) links(e.path, content);
  }

  // Canon portable de skills: YAML seguro, rutas locales y campos útiles.
  try {
    const skills = localPath(root, "docs/skills");
    if (!lstatSync(skills).isDirectory()) throw new Error("carpeta canónica requerida");
    for (const dir of readdirSync(skills, { withFileTypes: true })) {
      if (dir.name.startsWith(".") || dir.name === "README.md") continue;
      const path = `docs/skills/${dir.name}/SKILL.md`;
      try {
        if (!dir.isDirectory()) throw new Error("skill en carpeta local, sin symlinks/junctions");
        const m = readMetadata(root, path);
        if (!oneLine(m.name) || m.name.length > 64 || !oneLine(m.description) || m.description.length > 1024) throw new Error("name/description deben ser textos válidos y acotados");
        for (const key of ["license", "compatibility"]) if (m[key] !== undefined && !oneLine(m[key])) throw new Error(`${key} debe ser texto`);
        if (oneLine(m.compatibility) && m.compatibility.length > 500) throw new Error("compatibility mayor a 500 caracteres");
        if (m["allowed-tools"] !== undefined && !oneLine(m["allowed-tools"]) && !(Array.isArray(m["allowed-tools"]) && m["allowed-tools"].every(oneLine))) throw new Error("allowed-tools requiere texto o lista de textos");
        if (m["disable-model-invocation"] !== undefined && typeof m["disable-model-invocation"] !== "boolean") throw new Error("disable-model-invocation debe ser boolean");
        if (m.metadata !== undefined && (!m.metadata || typeof m.metadata !== "object" || Array.isArray(m.metadata))) throw new Error("metadata de skill debe ser un mapa");
      } catch (error) { add("error", path, (error as Error).message); }
    }
  } catch (error) { add("error", "docs/skills", (error as Error).message); }

  // Discovery es opcional; si existe, no puede duplicar o desviar el canon.
  try {
    const agents = join(root, ".agents");
    let parent;
    try { parent = lstatSync(agents); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (parent && (parent.isSymbolicLink() || !parent.isDirectory())) throw new Error(".agents no debe desviar inspección fuera del repo");
    const compat = join(agents, "skills");
    let stat;
    try { stat = lstatSync(compat); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (stat) {
      if (!stat.isSymbolicLink()) throw new Error("compatibilidad debe enlazar el canon, no copiar una carpeta real");
      const expected = realpathSync(localPath(root, "docs/skills"));
      const actual = realpathSync(compat);
      const same = process.platform === "win32" ? actual.toLowerCase() === expected.toLowerCase() : actual === expected;
      if (!same) throw new Error("compatibilidad no resuelve a docs/skills");
    }
  } catch (error) { add("error", ".agents/skills", (error as Error).message); }

  // Mantener avisos de specs sin cargar configs de foco ni abrir sus cuerpos.
  const prefixes = new Map<string, string[]>();
  for (const dir of ["specs", ".specify/specs"]) {
    if (!existsSync(join(root, dir))) continue;
    try {
      for (const child of readdirSync(localPath(root, dir), { withFileTypes: true })) {
        if (child.name.startsWith(".")) continue;
        const path = `${dir}/${child.name}`;
        if (!child.isDirectory()) {
          if (child.isSymbolicLink()) add("error", path, "spec local sin symlinks/junctions requerida");
          continue;
        }
        localPath(root, path);
        try {
          if (!lstatSync(localPath(root, `${path}/spec.md`)).isFile()) throw new Error("archivo regular requerido");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") add("warn", path, "spec.md ausente");
          else add("error", path, (error as Error).message);
        }
        const prefix = child.name.match(/^\d+/)?.[0];
        if (prefix) prefixes.set(prefix, [...(prefixes.get(prefix) ?? []), path]);
      }
    } catch (error) { add("error", dir, (error as Error).message); }
  }
  for (const [prefix, paths] of prefixes) if (paths.length > 1) add("warn", "specs", `prefijo ${prefix} duplicado: ${paths.join(", ")}`);
  return findings;
}

export function run(root: string, args: string[]): { code: number; output: string } {
  if (args.some(arg => arg !== "--json") || args.length > 1) return { code: 2, output: "Uso: bun run docs:check -- [--json]" };
  const findings = audit(root);
  const errors = findings.filter(f => f.level === "error");
  const warnings = findings.filter(f => f.level === "warn");
  const report = { status: errors.length ? "invalid_documentation" : "ok", errors, warnings };
  const output = args.includes("--json") ? JSON.stringify(report, null, 2) : [
    ...findings.map(f => `${f.level.toUpperCase()}: ${f.path}: ${f.message}`),
    `Comprobación documental: ${errors.length} errores, ${warnings.length} avisos. No certifica semántica, permisos, producto o integración.`,
  ].join("\n");
  return { code: errors.length ? 1 : 0, output };
}
if (import.meta.main) {
  const result = run(process.cwd(), process.argv.slice(2));
  console.log(result.output);
  process.exitCode = result.code;
}
