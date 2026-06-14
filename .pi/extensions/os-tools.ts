import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ContextUsage, ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const OS_COMPACT_INSTRUCTIONS = `Preservar contexto operativo del OS de Copicu con prioridad alta:
- objetivo actual y frente de trabajo;
- decisiones durables y su razonamiento;
- archivos modificados o consultados que importan;
- comandos/checks ejecutados y resultado relevante;
- riesgos, bloqueos y cosas que NO hay que hacer;
- proximo paso concreto;
- distinguir docs versionados como fuente de verdad frente a chat/transcript.
Descartar exploraciones descartadas, logs largos, razonamiento intermedio y ruido.`;

function readRepoFile(cwd: string, path: string): string | undefined {
  const full = join(cwd, path);
  if (!existsSync(full)) return undefined;
  return readFileSync(full, "utf8");
}

function section(content: string | undefined, heading: string, maxChars = 1800): string {
  if (!content) return "";
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const text = lines.slice(start, end).join("\n").trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n...` : text;
}

function formatUsage(usage: ContextUsage | undefined): string {
  if (!usage) return "desconocido";
  const pct = usage.percent == null ? "?" : `${Math.round(usage.percent)}%`;
  const tokens = usage.tokens == null ? "?" : `${usage.tokens}`;
  return `${pct} (${tokens}/${usage.contextWindow} tokens)`;
}

async function gitSummary(pi: ExtensionAPI): Promise<{ branch: string; dirty: string; changedCount: number }> {
  const branchResult = await pi.exec("git", ["branch", "--show-current"], { timeout: 5000 });
  const statusResult = await pi.exec("git", ["status", "--short"], { timeout: 5000 });
  const branch = branchResult.code === 0 ? branchResult.stdout.trim() || "(detached)" : "n/a";
  const lines = statusResult.code === 0 ? statusResult.stdout.trim().split(/\r?\n/).filter(Boolean) : [];
  return {
    branch,
    dirty: lines.length ? lines.slice(0, 12).join("\n") : "limpio",
    changedCount: lines.length,
  };
}

function buildDocsSnapshot(cwd: string): string {
  const wm = readRepoFile(cwd, "docs/WORKING_MEMORY.md");
  const topic = readRepoFile(cwd, "docs/topics/docs-knowledge-system.md");
  const next = section(wm, "Proximo Paso Probable", 1200);
  const decisions = section(wm, "Decisiones Vigentes", 1400) || section(wm, "Decisiones Recientes", 1400);
  const commands = section(wm, "Comandos De Contexto", 1000);
  const checkpoint = section(topic, "Checkpoint De Valor", 1200);

  return [next, decisions, commands, checkpoint].filter(Boolean).join("\n\n");
}

function hasPackageScript(cwd: string, scriptName: string): boolean {
  const raw = readRepoFile(cwd, "package.json");
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { scripts?: Record<string, unknown> };
    return typeof parsed.scripts?.[scriptName] === "string";
  } catch {
    return false;
  }
}

async function runContextAudit(pi: ExtensionAPI, cwd: string): Promise<string> {
  const command = hasPackageScript(cwd, "context:audit")
    ? ["bun", ["run", "context:audit"]] as const
    : ["bun", ["scripts/agent-context-audit.ts"]] as const;
  const result = await pi.exec(command[0], command[1], { timeout: 120000 });
  const output = `${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`.trim();
  return output.length > 2500 ? `${output.slice(0, 2500)}\n...` : output || `(sin salida, exit ${result.code})`;
}

function formatCommandResult(label: string, result: { code: number; stdout: string; stderr: string }): string {
  const output = `${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`.trim() || "(sin salida)";
  const clipped = output.length > 2200 ? `${output.slice(0, 2200)}\n...` : output;
  return `### ${label}\n\nExit: ${result.code}\n\n\`\`\`text\n${clipped}\n\`\`\``;
}

async function runOsSync(pi: ExtensionAPI, cwd: string): Promise<{ markdown: string; ok: boolean }> {
  const blocks: string[] = [];
  let ok = true;

  if (existsSync(join(cwd, "scripts", "ensure-skills-link.ps1"))) {
    const ensure = await pi.exec(
      "powershell.exe",
      ["-ExecutionPolicy", "Bypass", "-File", "scripts/ensure-skills-link.ps1"],
      { timeout: 120000 },
    );
    ok = ok && ensure.code === 0;
    blocks.push(formatCommandResult("ensure-skills-link", ensure));
  }

  const indexCommand = hasPackageScript(cwd, "context:index")
    ? ["bun", ["run", "context:index"]] as const
    : ["bun", ["scripts/context-index.ts"]] as const;
  const index = await pi.exec(indexCommand[0], indexCommand[1], { timeout: 120000 });
  ok = ok && index.code === 0;
  blocks.push(formatCommandResult("context:index", index));

  const auditCommand = hasPackageScript(cwd, "context:audit")
    ? ["bun", ["run", "context:audit"]] as const
    : ["bun", ["scripts/agent-context-audit.ts"]] as const;
  const audit = await pi.exec(auditCommand[0], auditCommand[1], { timeout: 120000 });
  ok = ok && audit.code === 0;
  blocks.push(formatCommandResult("context:audit", audit));

  return {
    ok,
    markdown: `## OS Sync\n\nSincronizacion de la capa agentica despues de cambios en docs, skills, prompts o extensiones.\n\n${blocks.join("\n\n")}`,
  };
}

async function buildStatusMarkdown(pi: ExtensionAPI, ctx: ExtensionCommandContext, includeAudit: boolean): Promise<string> {
  const usage = ctx.getContextUsage();
  const git = await gitSummary(pi);
  const sessionName = pi.getSessionName() ?? ctx.sessionManager.getSessionName() ?? "(sin nombre)";
  const sessionFile = ctx.sessionManager.getSessionFile() ?? "(ephemeral)";
  const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "(sin modelo)";
  const thinking = pi.getThinkingLevel();

  const audit = includeAudit
    ? await runContextAudit(pi, ctx.cwd)
    : "No ejecutado. Usá `/os-status audit` para correr el audit contextual.";

  return `## OS Status

- Sesion: ${sessionName}
- Session file: ${sessionFile}
- Modelo: ${model}
- Thinking: ${thinking}
- Contexto: ${formatUsage(usage)}
- Git branch: ${git.branch}
- Worktree: ${git.changedCount ? `${git.changedCount} archivo(s) con cambios` : "limpio"}

### Cambios Git

\`\`\`text
${git.dirty}
\`\`\`

### Audit

\`\`\`text
${audit}
\`\`\`

### Comandos utiles

- \`/checkpoint\`: persistir valor durable sin cerrar.
- \`/os-compact [foco]\`: compactacion manual con instrucciones OS-aware.
- \`/os-continuar [objetivo]\`: crear nueva sesion Pi usando docs como fuente.
- \`/os-sync\`: sincronizar indice/audit despues de cambios del OS.
- \`/reload\`: recargar extensiones/prompts/skills.`;
}

function buildHandoff(ctx: ExtensionCommandContext, goal: string, git: { branch: string; dirty: string; changedCount: number }): string {
  const docsSnapshot = buildDocsSnapshot(ctx.cwd);
  const currentSession = ctx.sessionManager.getSessionFile() ?? "(ephemeral)";
  const requestedGoal = goal || "Continuar con el proximo paso probable de docs/WORKING_MEMORY.md.";

  return `Continuar en ${ctx.cwd}.

Leer primero la ruta liviana:
1. docs/.generated/context-index.md
2. docs/WORKING_MEMORY.md
3. topic/track/spec puntual segun el objetivo

Sesion padre: ${currentSession}
Objetivo de esta nueva sesion: ${requestedGoal}

Estado desde docs vivos:
${docsSnapshot || "(No se pudo leer snapshot de docs vivos; usar ruta liviana.)"}

Git:
- Branch: ${git.branch}
- Worktree: ${git.changedCount ? `${git.changedCount} archivo(s) con cambios` : "limpio"}

Cambios visibles:
\`\`\`text
${git.dirty}
\`\`\`

Reglas de continuidad:
- El handoff no es fuente de verdad; prevalecen los docs versionados.
- No crear transcript.
- Si aparece valor durable nuevo, usar /checkpoint o persistir en docs vivos.
- Seguir en esta sesion nueva con el primer paso concreto.`;
}

async function continueSession(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext): Promise<void> {
  if (!ctx.hasUI) {
    ctx.ui.notify("os-continuar requiere UI para confirmar checkpoint.", "error");
    return;
  }

  const ok = await ctx.ui.confirm(
    "Crear nueva sesion OS",
    "Esto usa docs vivos como fuente. ¿Ya corriste /checkpoint si habia valor durable nuevo?",
  );
  if (!ok) {
    ctx.ui.setEditorText("/checkpoint");
    ctx.ui.notify("Primero corré /checkpoint. Despues usá /os-continuar.", "warning");
    return;
  }

  const git = await gitSummary(pi);
  const goal = args.trim();
  const handoff = buildHandoff(ctx, goal, git);
  const parentSession = ctx.sessionManager.getSessionFile();
  const name = goal ? `Copicu · ${goal.slice(0, 48)}` : "Copicu · continuidad OS";

  const result = await ctx.newSession({
    parentSession,
    setup: async (sessionManager) => {
      sessionManager.appendSessionInfo(name);
      sessionManager.appendCustomMessageEntry("os-handoff", handoff, true, { parentSession, goal });
    },
    withSession: async (replacementCtx) => {
      replacementCtx.ui.setEditorText("sigamos");
      replacementCtx.ui.notify("Nueva sesion OS lista. El editor tiene `sigamos`; enviá cuando quieras arrancar.", "info");
    },
  });

  if (result.cancelled) ctx.ui.notify("Nueva sesion cancelada.", "info");
}

export default function osTools(pi: ExtensionAPI) {
  pi.registerCommand("os-status", {
    description: "Mostrar estado operativo del OS de Copicu (usa 'audit' para correr context:audit)",
    handler: async (args, ctx) => {
      const includeAudit = /\baudit\b/i.test(args);
      const markdown = await buildStatusMarkdown(pi, ctx, includeAudit);
      pi.sendMessage({ customType: "os-status", content: markdown, display: true, details: { includeAudit } });
      ctx.ui.notify("OS status agregado a la sesion.", "info");
    },
  });

  pi.registerCommand("os-sync", {
    description: "Sincronizar la capa agentica despues de cambios del OS",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Sincronizando OS: skills link, context:index y context:audit...", "info");
      const result = await runOsSync(pi, ctx.cwd);
      pi.sendMessage({ customType: "os-sync", content: result.markdown, display: true, details: { ok: result.ok } });
      ctx.ui.notify(result.ok ? "OS sincronizado." : "OS sync termino con fallos; revisar salida.", result.ok ? "info" : "error");
    },
  });

  pi.registerCommand("gol", {
    description: "Preparar /until-done para ejecutar un objetivo acotado del OS Copicu",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/gol requiere UI para preparar el comando /until-done.", "error");
        return;
      }

      const goal = args.trim() || "<objetivo acotado: track/spec/tarea concreta>";
      ctx.ui.setEditorText(`/until-done ${goal}\n\nConstraints:\n- Follow AGENTS.md and the lightweight initial reading route.\n- Keep the goal narrow; do not refactor unrelated areas.\n- Use docs/specs/tracks as the durable source of truth; update only durable value, never transcript.\n- Verify with the smallest relevant checks, then broader checks if risk justifies it.\n- If app code/config/assets/frontend/backend change, reload or restart the dev app so JP sees the latest version.\n- Stop as blocked rather than guessing when native clipboard, global shortcut, focus, paste, installer, or destructive actions need JP confirmation.`);
      ctx.ui.notify("/gol preparo un comando /until-done en el editor. Revisalo y envialo para arrancar.", "info");
    },
  });

  pi.registerCommand("os-compact", {
    description: "Ejecutar compactacion manual con instrucciones OS-aware",
    handler: async (args, ctx) => {
      const focus = args.trim();
      const customInstructions = focus ? `${OS_COMPACT_INSTRUCTIONS}\n\nFoco adicional pedido por JP:\n${focus}` : OS_COMPACT_INSTRUCTIONS;
      ctx.compact({
        customInstructions,
        onComplete: () => ctx.ui.notify("OS-aware compaction completada.", "info"),
        onError: (error) => ctx.ui.notify(`OS-aware compaction fallo: ${error.message}`, "error"),
      });
      ctx.ui.notify("OS-aware compaction iniciada.", "info");
    },
  });

  pi.registerCommand("os-continuar", {
    description: "Crear una nueva sesion Pi con handoff compacto desde docs vivos",
    handler: async (args, ctx) => continueSession(pi, args, ctx),
  });

  pi.registerCommand("seguir", {
    description: "Alias corto de /os-continuar para crear una nueva sesion con continuidad OS",
    handler: async (args, ctx) => continueSession(pi, args, ctx),
  });

  pi.on("session_before_compact", async (_event, ctx) => {
    ctx.ui.notify("Compaction detectada. Para control manual futuro: /checkpoint y luego /os-compact.", "warning");
  });
}
