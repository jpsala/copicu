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
  const decisions = section(wm, "Decisiones Vigentes", 1400);
  const continuity = section(wm, "Comandos De Contexto", 1000);
  const checkpoint = section(topic, "Checkpoint De Valor", 1200);

  return [next, decisions, continuity, checkpoint].filter(Boolean).join("\n\n");
}

async function buildStatusMarkdown(pi: ExtensionAPI, ctx: ExtensionCommandContext, includeAudit: boolean): Promise<string> {
  const usage = ctx.getContextUsage();
  const git = await gitSummary(pi);
  const sessionName = pi.getSessionName() ?? ctx.sessionManager.getSessionName() ?? "(sin nombre)";
  const sessionFile = ctx.sessionManager.getSessionFile() ?? "(ephemeral)";
  const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "(sin modelo)";
  const thinking = pi.getThinkingLevel();

  let audit = "No ejecutado. Usá `/os-status audit` para correr `bun run context:audit`.";
  if (includeAudit) {
    const result = await pi.exec("bun", ["run", "context:audit"], { timeout: 120000 });
    const output = `${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`.trim();
    audit = output.length > 2500 ? `${output.slice(0, 2500)}\n...` : output || `(sin salida, exit ${result.code})`;
  }

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
    handler: async (args, ctx) => {
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
    },
  });

  pi.on("session_before_compact", async (_event, ctx) => {
    ctx.ui.notify("Compaction detectada. Para control manual futuro: /checkpoint y luego /os-compact.", "warning");
  });
}
