#!/usr/bin/env node
import { spawn } from "node:child_process";

const LARGE_CHUNK_WARNING = "Some chunks are larger than";

function parseArgs(argv) {
  const options = { enforce: "none" };
  for (const arg of argv) {
    if (arg.startsWith("--enforce=")) {
      options.enforce = arg.slice("--enforce=".length);
    }
  }
  return options;
}

function buildCommand() {
  if (process.platform === "win32") {
    return { command: "cmd.exe", args: ["/d", "/s", "/c", "npm run build"] };
  }
  return { command: "npm", args: ["run", "build"] };
}

function runBuild() {
  return new Promise((resolve) => {
    const build = buildCommand();
    const child = spawn(build.command, build.args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      output += chunk.toString();
    });
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

function findWarning(output) {
  const lines = output.split(/\r?\n/);
  return lines.filter((line) => line.includes(LARGE_CHUNK_WARNING));
}

function printSummary(warnings, enforce) {
  console.log("\n[vite-chunk-check] enforce=" + enforce);
  console.log("[vite-chunk-check] largeChunkWarnings=" + warnings.length);
  for (const warning of warnings) {
    console.log("[vite-chunk-check] warning=" + warning.trim());
  }
}

function shouldFail(warnings, enforce) {
  if (enforce === "no-large-chunk-warning") {
    return warnings.length > 0;
  }
  if (enforce === "none") {
    return false;
  }
  console.error("[vite-chunk-check] unknown enforce mode: " + enforce);
  return true;
}

const options = parseArgs(process.argv.slice(2));
const result = await runBuild();
const warnings = findWarning(result.output);
printSummary(warnings, options.enforce);

if (result.code !== 0) {
  process.exit(result.code);
}
if (shouldFail(warnings, options.enforce)) {
  process.exit(1);
}
