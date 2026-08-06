import { existsSync, readFileSync } from "node:fs";
import { validateTraycerRoutingPolicy } from "./traycer-routing-contract.ts";

const requiredFiles = [
  ".omp/config.yml",
  ".omp/commands/research.md",
  "docs/reference/tool-routing.yaml",
  "docs/topics/agent-tool-routing.md",
  "docs/topics/omp-agentic-os.md",
  "tests/manual/dogfood/COMPUTER_USE_BATTERY.md",
  "tests/manual/dogfood/PICKER_COMPUTER_USE_FOCUS_BATTERY.md",
  "docs/topics/portable-multiharness-contract.md",
];
const retiredFiles = [
  ".pi",
  "aos.requirements.json",
  "docs/topics/pi-agentic-os.md",
  "docs/topics/pi-extension-stack.md",
  "docs/reference/pi-agentic-os-command-surface.md",
];
const policyFiles = [
  "AGENTS.md",
  "docs/OS_PLAYBOOK.md",
  "docs/USER_GUIDE.md",
  "docs/topics/agent-tool-routing.md",
  "docs/topics/omp-agentic-os.md",
  "docs/reference/tool-routing.yaml",
];
const retiredTokens = [
  "/flow",
  "AOS_HOME",
  "aos.requirements.json",
  "copicu_computer_use",
  ".pi/extensions/copicu-computer-use.ts",
  ".codex-run/tools/ahk-mcp",
  "C:/Program Files/AutoHotkey",
];
const errors: string[] = [];

for (const path of requiredFiles) {
  if (!existsSync(path)) errors.push(`Missing ${path}`);
}
for (const path of retiredFiles) {
  if (existsSync(path)) errors.push(`Retired agentic file still exists: ${path}`);
}
for (const path of policyFiles) {
  if (!existsSync(path)) continue;
  const content = readFileSync(path, "utf8");
  for (const token of retiredTokens) {
    if (content.includes(token)) errors.push(`${path} contains retired token ${token}`);
  }
}

if (existsSync(".omp/config.yml")) {
  const config = readFileSync(".omp/config.yml", "utf8");
  if (!config.includes("computer:\n  enabled: true")) {
    errors.push(".omp/config.yml must enable native computer");
  }
  if (!config.includes("tools:\n  approvalMode: write")) {
    errors.push(".omp/config.yml must require approval for input");
  }
}

if (existsSync("docs/reference/tool-routing.yaml")) {
  const routing = readFileSync("docs/reference/tool-routing.yaml", "utf8");
  const portable = existsSync("docs/topics/portable-multiharness-contract.md")
    ? readFileSync("docs/topics/portable-multiharness-contract.md", "utf8")
    : "";
  errors.push(...validateTraycerRoutingPolicy(routing, portable));
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  console.log("Portable routing policy check passed.");
}
