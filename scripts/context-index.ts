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
  const triggers = list(fm, "triggers").slice(0, 8).join(", ");
  const label = path.replace("docs/topics/", "").replace(/\.md$/, "");
  lines.push(`- ${status}: [${label}](../${path.replace("docs/", "")})${triggers ? ` - ${triggers}` : ""}`);
}
lines.push("");

lines.push("## Tracks");
lines.push("");
for (const path of markdownFiles("docs/tracks")) {
  if (path.endsWith("/README.md")) continue;
  const content = read(path);
  const status = trackStatus(content);
  const label = title(content);
  lines.push(`- ${status}: [${label}](../${path.replace("docs/", "")})`);
}
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
  const operationalSkills = [
    "sigamos",
    "checkpoint",
    "cerrar-sesion",
    "continuar-sesion",
    "continuar-sesion-con-gol",
    "realinear-os",
  ].filter((skill) => skillDirs.includes(skill));
  lines.push("- Canon: [docs/skills/](../skills/)");
  if (operationalSkills.length) lines.push(`- Operational commands: ${operationalSkills.join(", ")}`);
  lines.push("- Guidance: [local-codex-skills](../topics/local-codex-skills.md)");
} else {
  lines.push("- Missing docs/skills/");
}
lines.push("");

lines.push("## Pi Resources");
lines.push("");
const piPrompts = markdownFiles(".pi/prompts").map((path) => path.replace(".pi/prompts/", "").replace(/\.md$/, ""));
const piExtensions = exists(".pi/extensions")
  ? readdirSync(join(root, ".pi", "extensions"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name)
    .sort()
  : [];
if (piPrompts.length) lines.push(`- Prompts: ${piPrompts.join(", ")}`);
if (piExtensions.length) lines.push(`- Extensions: ${piExtensions.join(", ")}`);
if (!piPrompts.length && !piExtensions.length) lines.push("- No project Pi resources found.");
lines.push("- Guidance: [pi-agentic-os](../topics/pi-agentic-os.md)");
lines.push("");

lines.push("## Aliases");
lines.push("");
if (exists("docs/GLOSSARY.md")) {
  const glossary = read("docs/GLOSSARY.md");
  const tableLines = glossary
    .split(/\r?\n/)
    .filter((line) => line.startsWith("|") && !line.includes("---"));
  lines.push(...tableLines);
} else {
  lines.push("- No glossary found.");
}
lines.push("");

const output = "docs/.generated/context-index.md";
mkdirSync(dirname(join(root, output)), { recursive: true });
writeFileSync(join(root, output), `${lines.join("\n")}\n`);
console.log(`Wrote ${output}`);
