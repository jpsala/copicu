import { existsSync, readFileSync } from "node:fs";
import { validateTraycerRoutingPolicy } from "./traycer-routing-contract.ts";

const policyPath = "docs/reference/tool-routing.yaml";
const portablePath = "docs/topics/portable-multiharness-contract.md";
const exactOmpNativeHeading = /##\s+OMP Native\b/i;
const exactDailyEntry = /Daily entry\s*:/i;
const ompToken = /\bOMP\b/i;
const dailyOrAuthorityTerm = /\b(?:daily|everyday|cotidiano|cotidiana|default|control|authority|gobierno)\b/i;
const nativeHarnessTerm = /\b(?:native|nativo)\b/i;
const harnessTerm = /\bharness\b/i;
const explicitSafeContext = /\b(?:standalone|stand[- ]alone|manual|fallback|product|producto|history|superseded|lab|laboratorio)\b/i;
const negatedRuntime = /(?:\b(?:no|sin|without)\b[^|\r\n]{0,40}\bruntime\b|\bruntime\b[^|\r\n]{0,40}\b(?:is\s+not|no(?:\s+se)?|not)\b)/i;

function projectionBlocks(source: string): Array<{ text: string; line: number }> {
  const lines = source.split(/\r?\n/);
  const blocks: Array<{ text: string; line: number }> = [];
  let current: string[] = [];
  let startLine = 1;
  let activeHeading = false;
  const flush = () => {
    if (current.length) blocks.push({ text: current.join("\n"), line: startLine });
    current = [];
    activeHeading = false;
  };
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      return;
    }
    if (trimmed.startsWith("|")) {
      flush();
      blocks.push({ text: line, line: index + 1 });
      return;
    }
    const isHeading = /^#{1,6}\s+/.test(trimmed) || /["'`]#{1,6}\s+/.test(trimmed);
    if (isHeading) {
      flush();
      startLine = index + 1;
      activeHeading = true;
      current.push(line);
      return;
    }
    if (activeHeading) current.push(line);
  });
  flush();
  return blocks;
}

export function validateHotProjectionAuthority(label: string, source: string): string[] {
  const errors: string[] = [];
  const inspect = (text: string, line: number) => {
    const hasSafeRuntime = /\bruntime\b/i.test(text) && !negatedRuntime.test(text);
    if (!ompToken.test(text) || explicitSafeContext.test(text) || hasSafeRuntime) return;
    if (dailyOrAuthorityTerm.test(text) || (nativeHarnessTerm.test(text) && harnessTerm.test(text))) {
      errors.push(`${label} contains semantic OMP authority at line ${line}`);
    }
  };
  source.split(/\r?\n/).forEach((line, index) => inspect(line, index + 1));
  projectionBlocks(source)
    .filter(({ text }) => text.includes("\n"))
    .forEach(({ text, line }) => inspect(text, line));
  return errors;
}

export function validateContextIndexProjection(
  generatorSource: string,
  generatedIndex: string,
): string[] {
  const errors: string[] = [];
  const inspect = (label: string, source: string) => {
    if (exactOmpNativeHeading.test(source)) {
      errors.push(`${label} must not publish OMP Native authority`);
    }
    if (exactDailyEntry.test(source)) {
      errors.push(`${label} must not publish Daily entry authority`);
    }
    errors.push(...validateHotProjectionAuthority(label, source));
    const lower = source.toLowerCase();
    if (!lower.includes("traycer") || !lower.includes("harness")) {
      errors.push(`${label} must publish Traycer with the active harness`);
    }
  };
  inspect("context-index generator", generatorSource);
  inspect("generated context index", generatedIndex);
  return [...new Set(errors)];
}

export function validateTopicsTable(source: string): string[] {
  const errors: string[] = [];
  const lines = source.split(/\r?\n/);
  const heading = lines.findIndex((line) => /^##\s+Topics De Entrada\s*$/i.test(line.trim()));
  if (heading < 0) return ["docs/TOPICS.md is missing the Topics De Entrada table"];
  const start = lines.findIndex((line, index) => index > heading && line.trim().startsWith("|"));
  if (start < 0) return ["docs/TOPICS.md is missing the Topics De Entrada table rows"];
  const rows: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    if (!lines[index].trim().startsWith("|")) break;
    rows.push(lines[index]);
  }
  const cellCount = (row: string) => {
    const normalized = row.trim().replace(/^\|/, "").replace(/\|$/, "");
    return normalized.split("|").length;
  };
  if (rows.length < 2) errors.push("docs/TOPICS.md Topics De Entrada table is incomplete");
  const expected = rows.length ? cellCount(rows[0]) : 0;
  rows.forEach((row, index) => {
    if (cellCount(row) !== expected) {
      errors.push(`docs/TOPICS.md Topics De Entrada row ${index + 1} has inconsistent width`);
    }
  });
  if (rows.length > 1 && rows[1].split("|").some((cell) => cell.trim() && !/^\s*:?-{3,}:?\s*$/.test(cell))) {
    errors.push("docs/TOPICS.md Topics De Entrada table has an invalid separator");
  }
  const portableRow = rows.some((row) => row.toLowerCase().includes("tools del harness"));
  if (!portableRow) errors.push("docs/TOPICS.md portable tools row must be inside the Topics table");
  lines.forEach((line, index) => {
    if (index > start + rows.length && /^\|\s*Tools\b/i.test(line.trim())) {
      errors.push("docs/TOPICS.md contains an orphan tools row outside the Topics table");
    }
  });
  return [...new Set(errors)];
}

export function runTraycerRoutingCheck(): number {
  const policy = existsSync(policyPath) ? readFileSync(policyPath, "utf8") : "";
  const portable = existsSync(portablePath) ? readFileSync(portablePath, "utf8") : "";
  const generatorPath = "scripts/context-index.ts";
  const generatedPath = "docs/.generated/context-index.md";
  const topicsPath = "docs/TOPICS.md";
  const errors = validateTraycerRoutingPolicy(policy, portable);
  if (!existsSync(policyPath)) errors.push("Missing " + policyPath);
  if (!existsSync(portablePath)) errors.push("Missing " + portablePath);
  errors.push(
    ...validateContextIndexProjection(
      existsSync(generatorPath) ? readFileSync(generatorPath, "utf8") : "",
      existsSync(generatedPath) ? readFileSync(generatedPath, "utf8") : "",
    ),
    ...validateTopicsTable(existsSync(topicsPath) ? readFileSync(topicsPath, "utf8") : ""),
  );
  if (errors.length) {
    errors.forEach((error) => console.error("ERROR: " + error));
    return 1;
  }
  console.log("Traycer portable routing and context projection passed.");
  return 0;
}

if (process.argv[1]?.endsWith("traycer-routing-check.ts")) {
  process.exitCode = runTraycerRoutingCheck();
}
