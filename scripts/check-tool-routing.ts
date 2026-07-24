import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "package.json",
  "aos.requirements.json",
  "docs/reference/tool-routing.yaml",
  "docs/topics/agent-tool-routing.md",
  "docs/topics/pi-agentic-os.md",
];
const activeFiles = [
  "AGENTS.md",
  "docs/WORKING_MEMORY.md",
  "docs/OS_PLAYBOOK.md",
  "docs/topics/pi-agentic-os.md",
  "docs/topics/agent-tool-routing.md",
  "docs/reference/pi-agentic-os-command-surface.md",
  "docs/reference/tool-routing.yaml",
];
const lifecycleAliases = [
  "/aos-gol",
  "/aos-continuar",
  "/aos-guardar-sesion",
  "/aos-checkpoint",
  "/aos-cerrar",
  "/aos-sigamos",
  "/aos-plan-implementar",
  "/aos-orquestar",
  "/aos-fanout",
  "/until-done",
];
const supersededSkills = [
  "aos-gol-lite",
  "cerrar-sesion",
  "checkpoint",
  "continuar-sesion",
  "continuar-sesion-con-gol",
  "sigamos",
];
const errors: string[] = [];

for (const path of requiredFiles) {
  if (!existsSync(path)) errors.push(`Missing ${path}`);
}

try {
  const requirements = JSON.parse(readFileSync("aos.requirements.json", "utf8"));
  const flow = requirements?.commands?.flow;
  if (
    requirements?.schemaVersion !== 1 ||
    flow?.contract !== "aos.flow-first" ||
    flow?.minVersion !== "1.1.0" ||
    flow?.scope !== "user" ||
    flow?.cardinality !== 1
  ) {
    errors.push("aos.requirements.json does not declare one user-scoped AOS 1.1 /flow");
  }
} catch {
  errors.push("aos.requirements.json is missing or invalid JSON");
}

if (existsSync(".pi/extensions/aos-flujo.ts")) {
  errors.push("Project-local .pi/extensions/aos-flujo.ts duplicates global /flow");
}
for (const alias of lifecycleAliases) {
  for (const path of activeFiles) {
    if (existsSync(path) && readFileSync(path, "utf8").includes(alias)) {
      errors.push(`${path} contains superseded lifecycle alias ${alias}`);
    }
  }
}
for (const skill of supersededSkills) {
  if (existsSync(`docs/skills/${skill}`)) {
    errors.push(`docs/skills/${skill} competes with global /flow`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  console.log("Flow-first routing policy check passed.");
}
