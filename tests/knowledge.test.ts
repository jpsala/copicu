import { afterEach, beforeEach, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { catalog, query } from "../scripts/knowledge.ts";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "copicu knowledge con espacios "));
  for (const dir of ["docs/tracks", "docs/topics"]) mkdirSync(join(root, dir), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function doc(kind: string, id: string, data: object, body = "BODY_SYNTHETIC_PRIVATE") {
  writeFileSync(join(root, "docs", kind, `${id}.md`), `---\n${Bun.YAML.stringify(data, null, 2)}\n---\n${body}\n`);
}
function track(id: string, extra = {}) {
  doc("tracks", id, { title: id, summary: "Captura sintética", status: "active", last_worked: null, next: "Acotar un repro", ...extra });
}
function topic() { doc("topics", "audio", { title: "Audio", summary: "Captura", keywords: ["Micrófono", "WASAPI"] }); }
function json(...args: string[]) {
  const result = query(root, [...args, "--json"]);
  return { code: result.code, ...JSON.parse(result.output) };
}

test("consulta OS2 sólo metadata, sin foco global ni resultados seleccionados por scoring", () => {
  topic(); track("one", { topics: ["audio"] }); track("two", { status: "paused" });
  expect(json("check").code).toBe(0);
  expect(json("tracks").entries.length).toBe(2);
  expect(json("tracks", "paused").entries[0].id).toBe("two");
  expect(json("search", "MICROFONO wasapi").entries[0].id).toBe("audio");
  expect(json("search", "audio").entries.length).toBe(2);
  expect(json("search", "BODY_SYNTHETIC_PRIVATE").entries).toEqual([]);
  expect(query(root, ["tracks"]).output).not.toContain("BODY_SYNTHETIC_PRIVATE");
  expect(json("tracks").focus).toBeUndefined();
});

test("null importado conserva trabajo previo y no infiere UTC por mtime", () => {
  doc("tracks", "imported", { title: "Import", summary: "Corte completado", status: "closed", last_worked: null }, "Procedencia: updated 2026-09-30, status complete; UTC desconocida, no trabajo inexistente.");
  const path = join(root, "docs/tracks/imported.md");
  const before = readFileSync(path, "utf8");
  utimesSync(path, new Date("2030-01-01"), new Date("2030-01-01"));
  expect(json("check").code).toBe(0);
  expect(json("tracks", "closed").entries[0].last_worked).toBeNull();
  expect(query(root, ["last"]).output).toBe("Sin fecha UTC de trabajo registrada.");
  track("dated", { last_worked: "2026-09-25T10:00:00Z" });
  track("tie", { status: "closed", last_worked: "2026-09-25T10:00:00Z" });
  expect(json("last").entries.map(e => e.id)).toEqual(["dated", "tie"]);
  expect(readFileSync(path, "utf8")).toBe(before);
});

test("rechaza metadata legacy, fechas falsas, estados y referencias inválidos", () => {
  for (const extra of [{ status: "complete" }, { status: ["active"] }, { last_worked: "2026-09-30" }, { last_worked: "2026-02-30T10:00:00Z" }, { last_worked: "2026-09-30T00:00:00+00:00" }, { owner: "JP" }, { id: "old" }, { next: "" }, { topics: "audio" }]) {
    track("bad", extra);
    expect(json("tracks").code).toBe(1);
  }
  track("bad", { topics: ["audio"] });
  expect(json("tracks").code).toBe(0);
  expect(json("check").code).toBe(1);
  topic();
  expect(json("check").code).toBe(0);
});

test("errores de uso no enumeran corpus ni simulan comandos retirados", () => {
  for (const args of [["show"], ["focus"], ["query", "audio"], ["search", "\u0301"], ["tracks", "complete"], ["topics", "extra"], ["check", "--json", "--json"], ["--root", root]]) expect(query(root, args).code).toBe(2);
  expect(query(root, []).code).toBe(0);
  expect(json("help").help).toContain("Sin escrituras");
});

test("metadata acotada, duplicados y chunk boundaries sin abrir todo el cuerpo", () => {
  const path = join(root, "docs/topics/audio.md");
  const prefix = "---\ntitle: Audio\nsummary: Sound\nkeywords: [mic]\n#";
  const first = prefix + "x".repeat(1020 - Buffer.byteLength(prefix)) + "\n---";
  writeFileSync(path, first + "not-a-delimiter\n");
  expect(json("topics").code).toBe(1);
  writeFileSync(path, first + "\nBody");
  expect(json("topics").code).toBe(0);
  writeFileSync(path, "---\ntitle: Audio\ntitle: Duplicate\nsummary: Sound\nkeywords: [mic]\n---\nBody");
  expect(json("topics").code).toBe(1);
  writeFileSync(path, "---\ntitle: " + "x".repeat(17000) + "\nsummary: Sound\nkeywords: [mic]\n---\n");
  expect(json("topics").code).toBe(1);
  writeFileSync(path, "\uFEFF---\r\ntitle: Audio\r\nsummary: Sound\r\nkeywords: [mic]\r\n---\r\n" + "x".repeat(200000));
  expect(json("topics").code).toBe(0);
});

test("no sigue subcarpetas o enlaces del catálogo", () => {
  topic();
  mkdirSync(join(root, "docs/topics/nested"));
  expect(json("topics").code).toBe(1);
  rmSync(join(root, "docs/topics/nested"), { recursive: true });
  const external = mkdtempSync(join(tmpdir(), "copicu-external-"));
  try {
    writeFileSync(join(external, "hidden.md"), "SYNTHETIC_OUTSIDE");
    symlinkSync(external, join(root, "docs/topics/linked"), "junction");
    expect(json("topics").code).toBe(1);
    expect(query(root, ["topics"]).output).not.toContain("SYNTHETIC_OUTSIDE");
  } finally { rmSync(external, { recursive: true, force: true }); }
});

test("CLI nuevo funciona aislado en path con espacios sin escrituras, harness ni instalación", () => {
  topic(); track("latency", { topics: ["audio"] });
  mkdirSync(join(root, "scripts"));
  cpSync(resolve(import.meta.dir, "../scripts/knowledge.ts"), join(root, "scripts/knowledge.ts"));
  writeFileSync(join(root, ".env"), "SYNTHETIC_SECRET_DO_NOT_READ");
  const snapshot = () => Object.fromEntries([".env", "scripts/knowledge.ts", "docs/tracks/latency.md", "docs/topics/audio.md"].map(p => [p, readFileSync(join(root, p), "utf8")]));
  const before = snapshot();
  for (const args of [["check", "--json"], ["search", "microfono", "--json"], ["tracks", "--json"]]) {
    const result = Bun.spawnSync([process.execPath, "scripts/knowledge.ts", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode).toBe(0);
    const output = result.stdout.toString();
    expect(JSON.parse(output).errors).toEqual([]);
    expect(output).not.toContain("SYNTHETIC_SECRET_DO_NOT_READ");
    expect(output).not.toContain("BODY_SYNTHETIC_PRIVATE");
  }
  expect(snapshot()).toEqual(before);
  expect(readdirSync(root).sort()).toEqual([".env", "docs", "scripts"]);
  expect(catalog(root).entries.length).toBe(2);
});
