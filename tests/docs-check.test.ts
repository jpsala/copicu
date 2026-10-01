import { afterEach, beforeEach, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { audit, run } from "../scripts/docs-check.ts";

let root: string;
function put(path: string, content: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}
function metadata(path: string, data: object) { put(path, `---\n${Bun.YAML.stringify(data, null, 2)}\n---\nContenido sintético.\n`); }
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "copicu-docs-check-"));
  put("AGENTS.md", "# Reglas locales\nLeer Distinciones imprescindibles del [glosario](docs/topics/glossary.md).\n");
  put("docs/topics/glossary.md", "---\ntitle: Glosario\nsummary: Vocabulario sintético\nkeywords: [glosario]\n---\n## Distinciones imprescindibles\nTérminos del fixture.\n");
  put("docs/README.md", "# Mapa\n[Topic](topics/capture.md)\n");
  metadata("docs/topics/capture.md", { title: "Capture", summary: "Datos sintéticos", keywords: ["clipboard"] });
  metadata("docs/tracks/imported.md", { title: "Import", summary: "Registro previo", status: "closed", last_worked: null, topics: ["capture"] });
  metadata("docs/skills/demo/SKILL.md", { name: "demo", description: "Procedimiento portable", "allowed-tools": ["read"], "disable-model-invocation": false });
  put("specs/001-demo/spec.md", "# Spec sintética\n");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
const errors = () => audit(root).filter(f => f.level === "error");

test("glosario obligatorio: ausencia, entrada vacía y enlaces sólo en ejemplos fallan", () => {
  const original = readFileSync(join(root, "docs/topics/glossary.md"), "utf8");
  unlinkSync(join(root, "docs/topics/glossary.md"));
  expect(errors().some(f => f.path === "docs/topics/glossary.md")).toBe(true);
  put("docs/topics/glossary.md", original.replace("Términos del fixture.", "<!-- sólo comentario -->\n## Otra sección\nNo es la entrada."));
  expect(errors().some(f => f.message.includes("sección no vacía"))).toBe(true);
  put("docs/topics/glossary.md", original);
  for (const sample of ["<!-- [g](docs/topics/glossary.md) -->", "```md\n[g](docs/topics/glossary.md)\n```", "    [g](docs/topics/glossary.md)", "`[g](docs/topics/glossary.md)`"]) {
    put("AGENTS.md", sample);
    expect(errors().some(f => f.message.includes("referencia Markdown"))).toBe(true);
  }
  put("AGENTS.md", "Leer [g](./docs/topics/glossary.md#distinciones-imprescindibles).");
  expect(errors()).toEqual([]);
});

test("check no exige WM, OMP, Pi, bootstrap markers ni junction/discovery", () => {
  expect(errors()).toEqual([]);
  expect(run(root, []).code).toBe(0);
  put(".omp/config.yml", "computer:\n  enabled: false\napprovalMode: example\n");
  put(".pi/README.md", "Integración opt-in sintética; no núcleo.\n");
  expect(errors()).toEqual([]);
  expect(run(root, ["--repair"]).code).toBe(2);
});

test("metadata OS2 corrupta y relaciones inexistentes mantienen fallo visible", () => {
  metadata("docs/tracks/imported.md", { title: "Import", summary: "Registro previo", status: "closed", last_worked: "2026-09-30", topics: ["capture"] });
  expect(errors().some(f => f.message.includes("last_worked"))).toBe(true);
  metadata("docs/tracks/imported.md", { title: "Import", summary: "Registro previo", status: "closed", last_worked: null, topics: ["missing"] });
  expect(run(root, ["--json"]).code).toBe(1);
  expect(errors().some(f => f.message.includes("topic inexistente"))).toBe(true);
});

test("gates útiles de skills siguen validando YAML, duplicados, tipos y límites", () => {
  for (const extra of [{ name: "" }, { description: "x".repeat(1025) }, { "allowed-tools": ["read", null] }, { "disable-model-invocation": "yes" }, { metadata: [] }]) {
    metadata("docs/skills/demo/SKILL.md", { name: "demo", description: "Portable", ...extra });
    expect(errors().some(f => f.path.endsWith("SKILL.md"))).toBe(true);
  }
  put("docs/skills/demo/SKILL.md", "---\nname: demo\ndescription: Unsafe: plain colon\n---\n");
  expect(errors().some(f => f.path.endsWith("SKILL.md"))).toBe(true);
  put("docs/skills/demo/SKILL.md", "---\nname: demo\nname: duplicate\ndescription: Portable\n---\n");
  expect(errors().some(f => f.message.includes("duplicado"))).toBe(true);
});

test("descubrimiento opcional no duplica ni desvía el canon, sin repararlo", () => {
  mkdirSync(join(root, ".agents/skills"), { recursive: true });
  expect(errors().some(f => f.path === ".agents/skills")).toBe(true);
  rmSync(join(root, ".agents/skills"), { recursive: true });
  symlinkSync(join(root, "docs/skills"), join(root, ".agents/skills"), "junction");
  expect(errors()).toEqual([]);
  if (process.platform === "win32") rmdirSync(join(root, ".agents/skills"));
  else unlinkSync(join(root, ".agents/skills"));
  const outside = mkdtempSync(join(tmpdir(), "copicu-outside-skills-"));
  try {
    symlinkSync(outside, join(root, ".agents/skills"), "junction");
    expect(errors().some(f => f.path === ".agents/skills")).toBe(true);
  } finally { rmSync(outside, { recursive: true, force: true }); }
});

test("links faltantes o escapes fallan, ejemplos fenced y URLs no se consultan", () => {
  put("docs/README.md", "# Mapa\n[missing](missing.md)\n");
  expect(errors().some(f => f.message.includes("destino relativo"))).toBe(true);
  put("docs/README.md", "# Mapa\n[escape](../../../outside.md)\n");
  expect(errors().some(f => f.message.includes("fuera del repo"))).toBe(true);
  put("docs/README.md", "# Mapa\n```markdown\n[ejemplo](missing.md)\n```\n[externo](https://invalid.example/)\n[ancla](#sin-validar)\nEjemplo inline `![...](...)`, no un destino real.\n");
  expect(errors()).toEqual([]);
});

test("se conservan avisos de spec.md y prefijos repetidos sin leer configs de foco", () => {
  mkdirSync(join(root, "specs/001-another"));
  const findings = audit(root);
  expect(findings.some(f => f.level === "warn" && f.message.includes("spec.md ausente"))).toBe(true);
  expect(findings.some(f => f.level === "warn" && f.message.includes("duplicado"))).toBe(true);
  put(".specify/feature.json", "SYNTHETIC_NOT_A_FOCUS_CONFIG");
  expect(run(root, []).code).toBe(0);
});

test("check aislado funciona sin node_modules, no escribe ni crea discovery", () => {
  for (const file of ["knowledge.ts", "docs-check.ts"]) {
    mkdirSync(join(root, "scripts"), { recursive: true });
    cpSync(resolve(import.meta.dir, `../scripts/${file}`), join(root, "scripts", file));
  }
  put(".env", "SYNTHETIC_PRIVATE_DATA");
  const files = [".env", "AGENTS.md", "docs/README.md", "docs/topics/capture.md", "docs/tracks/imported.md", "docs/skills/demo/SKILL.md"];
  const before = files.map(p => readFileSync(join(root, p), "utf8"));
  const result = Bun.spawnSync([process.execPath, "scripts/docs-check.ts", "--json"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout.toString()).errors).toEqual([]);
  expect(result.stdout.toString()).not.toContain("SYNTHETIC_PRIVATE_DATA");
  expect(files.map(p => readFileSync(join(root, p), "utf8"))).toEqual(before);
  expect(readdirSync(root).sort()).toEqual([".env", "AGENTS.md", "docs", "scripts", "specs"]);
});
