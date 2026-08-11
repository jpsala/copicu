import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();

function exists(path: string) {
  return existsSync(join(root, path));
}

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function frontmatter(content: string) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match?.[1] ?? "";
}

function scalar(frontmatterText: string, key: string) {
  const match = frontmatterText.match(new RegExp(`^${key}:[ \\t]*([^\\r\\n]*)`, "m"));
  return match?.[1]?.trim() ?? "";
}

function list(frontmatterText: string, key: string) {
  const match = frontmatterText.match(new RegExp(`^${key}:\\s*\\r?\\n((?:\\s+- .+\\r?\\n?)+)`, "m"));
  if (!match) return [];
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^- /, "").trim())
    .filter(Boolean);
}

function markdownFiles(dir: string) {
  const fullDir = join(root, dir);
  if (!existsSync(fullDir)) return [];
  return readdirSync(fullDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => `${dir}/${entry.name}`.replaceAll("\\", "/"))
    .sort();
}

function title(content: string) {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? "Untitled";
}

function trackStatus(content: string) {
  const fm = frontmatter(content);
  return scalar(fm, "status") || "unknown";
}

function focusedTrackPaths(): Set<string> {
  if (!exists("docs/WORKING_MEMORY.md")) return new Set();
  const memory = read("docs/WORKING_MEMORY.md");
  const heading = "## Foco Único De Ejecución";
  const start = memory.indexOf(heading);
  if (start < 0) return new Set();
  const remainder = memory.slice(start + heading.length);
  const nextHeading = remainder.search(/\r?\n##\s/);
  const focus = nextHeading >= 0 ? remainder.slice(0, nextHeading) : remainder;
  const state = focus.match(/^- \*\*Estado:\*\* `([^`]+)`/m)?.[1];
  const field = state === "ready" ? "Plan" : state === "blocked" || state === "waiting_gate" ? "Referencia" : undefined;
  if (!field) return new Set();
  const pattern = new RegExp("^- \\*\\*" + field + ":\\*\\* `(docs/tracks/[^`]+\\.md)`", "gm");
  return new Set([...focus.matchAll(pattern)].map((match) => match[1]));
}

const lines: string[] = [];
lines.push("# Context Index");
lines.push("");
lines.push("Generated cache. Do not edit by hand.");
lines.push("");
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push("");

lines.push("## Topics");
lines.push("");
for (const path of markdownFiles("docs/topics")) {
  const content = read(path);
  const fm = frontmatter(content);
  const status = scalar(fm, "status") || "unknown";
  const label = path.replace("docs/topics/", "").replace(/\.md$/, "");
  lines.push(`- ${status}: [${label}](../${path.replace("docs/", "")})`);
}
lines.push("");

lines.push("## Tracks");
lines.push("");
const focusedTracks = focusedTrackPaths();
let focusedTrackCount = 0;
for (const path of markdownFiles("docs/tracks")) {
  if (path.endsWith("/README.md") || path.endsWith("/TEMPLATE.md") || !focusedTracks.has(path)) continue;
  const content = read(path);
  const status = trackStatus(content);
  const label = title(content);
  lines.push(`- ${status}: [${label}](../${path.replace("docs/", "")})`);
  focusedTrackCount += 1;
}
if (!focusedTrackCount) lines.push("- No focused track. Search `docs/tracks/` on demand.");
else lines.push("- Other tracks are omitted from the hot index; search `docs/tracks/` on demand.");
lines.push("");

lines.push("## Specs");
lines.push("");
const specRoots = ["specs", ".specify/specs"].filter(exists);
const specs = specRoots
  .flatMap((specRoot) =>
    readdirSync(join(root, specRoot), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ root: specRoot, name: entry.name })),
  )
  .sort((left, right) => `${left.root}/${left.name}`.localeCompare(`${right.root}/${right.name}`));
if (specs.length) {
  for (const spec of specs) lines.push(`- [${spec.name}](../../${spec.root}/${spec.name}/)`);
} else {
  lines.push("- No active spec directories found.");
}
lines.push("");

lines.push("## Skills");
lines.push("");
const skillDirs = exists("docs/skills")
  ? readdirSync(join(root, "docs", "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  : [];
if (skillDirs.length) {
  const nonCommandSkills = new Set(["impeccable"]);
  const legacyAliasSkills = new Set([
    "checkpoint",
    "cerrar-sesion",
    "continuar-sesion",
    "continuar-sesion-con-gol",
    "evaluar-skills",
    "realinear-os",
    "repo-commit-push",
    "sigamos",
    "aos-checkpoint",
    "aos-cerrar-sesion",
    "aos-continuar-sesion",
    "aos-continuar-sesion-con-gol",
  ]);
  const operationalSkills = skillDirs
    .filter((skill) => !skill.startsWith("speckit-") && !skill.startsWith("aos-speckit-"))
    .filter((skill) => !nonCommandSkills.has(skill) && !legacyAliasSkills.has(skill))
    .filter((skill) => exists(`docs/skills/${skill}/SKILL.md`));
  lines.push("- Canon: [docs/skills/](../skills/)");
  if (operationalSkills.length) lines.push(`- Operational commands: ${operationalSkills.join(", ")}`);
  lines.push("- Guidance: [local-codex-skills](../topics/local-codex-skills.md)");
} else {
  lines.push("- Missing docs/skills/");
}
lines.push("");

lines.push("## Local agentic capabilities");
lines.push("");
lines.push("- AOS context: docs, working memory, topics, tracks, specs, skills and local gates.");
lines.push("- OMP boundary: runtime models, effort, tools, browser, todos, agents, planning, parallelism, language, style and modes.");
lines.push("- Computer: built-in enabled by [.omp/config.yml](../../.omp/config.yml); no local wrapper.");
lines.push("- Commands: opt-in [research](../../.omp/commands/research.md).");
lines.push("- Oracle C0: external app -> foreground hotkey -> global type without targeting Copicu -> visible token.");
lines.push("- Skills: `.agents/skills` discovers the canon in `docs/skills/`.");
lines.push("- Guidance: [omp-agentic-os](../topics/omp-agentic-os.md)");
lines.push("");

lines.push("## Aliases");
lines.push("");
if (exists("docs/GLOSSARY.md")) {
  const glossary = read("docs/GLOSSARY.md");
  const aliases = glossary
    .split(/\r?\n/)
    .filter((line) => line.startsWith("|") && !line.includes("---"))
    .slice(1)
    .map((line) => line.split("|")[1]?.trim())
    .filter(Boolean);
  lines.push(`- See [GLOSSARY.md](../GLOSSARY.md) for ${aliases.length} alias definitions.`);
} else {
  lines.push("- No glossary found.");
}
lines.push("");

while (lines.at(-1) === "") lines.pop();

const output = "docs/.generated/context-index.md";
mkdirSync(dirname(join(root, output)), { recursive: true });
writeFileSync(join(root, output), `${lines.join("\n")}\n`);
console.log(`Wrote ${output}`);
