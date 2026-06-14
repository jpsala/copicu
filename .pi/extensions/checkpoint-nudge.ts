import type { ContextUsage, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type Level = "none" | "soft" | "strong" | "critical";

const STATUS_KEY = "checkpoint-nudge";
const SOFT_PERCENT = 70;
const STRONG_PERCENT = 85;
const CRITICAL_PERCENT = 92;
const SAME_LEVEL_COOLDOWN_MS = 15 * 60 * 1000;

let lastLevel: Level = "none";
let lastNoticeAt = 0;
let muted = false;
let checkpointPendingLabel = false;

function classify(percent: number | null | undefined): Level {
  if (percent == null) return "none";
  if (percent >= CRITICAL_PERCENT) return "critical";
  if (percent >= STRONG_PERCENT) return "strong";
  if (percent >= SOFT_PERCENT) return "soft";
  return "none";
}

function formatPercent(percent: number | null | undefined): string {
  return percent == null ? "?" : `${Math.round(percent)}%`;
}

function shouldNotify(level: Level): boolean {
  if (muted || level === "none") return false;

  const now = Date.now();
  const escalated = levelRank(level) > levelRank(lastLevel);
  const cooledDown = now - lastNoticeAt > SAME_LEVEL_COOLDOWN_MS;
  return escalated || cooledDown;
}

function levelRank(level: Level): number {
  switch (level) {
    case "critical":
      return 3;
    case "strong":
      return 2;
    case "soft":
      return 1;
    default:
      return 0;
  }
}

function noticeFor(level: Level, percent: string): { text: string; kind: "info" | "warning" | "error" } {
  if (level === "critical") {
    return {
      kind: "error",
      text: `Contexto en ${percent}. Recomendado: ejecutar /checkpoint antes de seguir con trabajo grande o antes de compactar manualmente.`,
    };
  }

  if (level === "strong") {
    return {
      kind: "warning",
      text: `Contexto en ${percent}. Si hubo decisiones o estado valioso, conviene /checkpoint pronto.`,
    };
  }

  return {
    kind: "info",
    text: `Contexto en ${percent}. No hace falta cortar sesion; solo usá /checkpoint si hubo valor durable.`,
  };
}

function updateStatus(ctx: ExtensionContext, usage: ContextUsage | undefined, level: Level): void {
  if (muted || level === "none") {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    return;
  }

  const tokens = usage?.tokens == null ? "?" : `${Math.round(usage.tokens / 1000)}k`;
  ctx.ui.setStatus(STATUS_KEY, `checkpoint ${formatPercent(usage?.percent)} (${tokens})`);
}

function check(ctx: ExtensionContext): void {
  const usage = ctx.getContextUsage();
  const level = classify(usage?.percent);
  updateStatus(ctx, usage, level);

  if (level === "none") {
    lastLevel = "none";
    return;
  }

  if (shouldNotify(level)) {
    const notice = noticeFor(level, formatPercent(usage?.percent));
    ctx.ui.notify(notice.text, notice.kind);
    lastNoticeAt = Date.now();
  }

  lastLevel = level;
}

function isCheckpointInput(text: string): boolean {
  return /^(\/checkpoint\b|checkpoint\b|persist[íi]\s+estado\b|guard[aá]\s+lo\s+valioso\b)/i.test(text.trim());
}

function labelCurrentLeaf(pi: ExtensionAPI, ctx: ExtensionContext, label: string): void {
  const leaf = ctx.sessionManager.getLeafEntry();
  if (!leaf) return;
  pi.setLabel(leaf.id, label);
}

export default function checkpointNudge(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    muted = false;
    lastLevel = "none";
    lastNoticeAt = 0;
    checkpointPendingLabel = false;
    ctx.ui.notify("Checkpoint nudge activo: avisos en 70%, 85% y 92% de contexto.", "info");
    check(ctx);
  });

  pi.on("input", async (event) => {
    if (event.source === "extension") return { action: "continue" as const };
    if (isCheckpointInput(event.text)) checkpointPendingLabel = true;
    return { action: "continue" as const };
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (checkpointPendingLabel) {
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      labelCurrentLeaf(pi, ctx, `checkpoint ${stamp}`);
      checkpointPendingLabel = false;
      ctx.ui.notify("Checkpoint etiquetado en /tree.", "info");
    }
    check(ctx);
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    check(ctx);
  });

  pi.on("session_before_compact", async (_event, ctx) => {
    if (!muted) {
      ctx.ui.notify(
        "Pi va a compactar contexto. Si hay valor durable no persistido, recordá usar /checkpoint en el siguiente punto seguro.",
        "warning",
      );
    }
  });

  pi.registerCommand("checkpoint-nudge", {
    description: "Ver o controlar avisos automaticos de checkpoint por uso de contexto",
    handler: async (args, ctx) => {
      const action = String(args ?? "").trim().toLowerCase();

      if (action === "mute" || action === "off") {
        muted = true;
        ctx.ui.setStatus(STATUS_KEY, undefined);
        ctx.ui.notify("Checkpoint nudge silenciado para esta sesion.", "info");
        return;
      }

      if (action === "unmute" || action === "on") {
        muted = false;
        lastLevel = "none";
        lastNoticeAt = 0;
        ctx.ui.notify("Checkpoint nudge reactivado.", "info");
        check(ctx);
        return;
      }

      if (action === "prefill") {
        ctx.ui.setEditorText("/checkpoint");
        ctx.ui.notify("Editor preparado con /checkpoint.", "info");
        return;
      }

      if (action === "test") {
        ctx.ui.notify("Prueba checkpoint nudge: si esto fuera 85%, te sugeriria ejecutar /checkpoint.", "warning");
        return;
      }

      const usage = ctx.getContextUsage();
      const level = classify(usage?.percent);
      updateStatus(ctx, usage, level);
      ctx.ui.notify(
        `Checkpoint nudge: ${muted ? "silenciado" : "activo"}. Contexto ${formatPercent(usage?.percent)} (${usage?.tokens ?? "?"}/${usage?.contextWindow ?? "?"} tokens). Nivel: ${level}. Comandos: /checkpoint-nudge prefill | mute | unmute | test`,
        level === "critical" ? "error" : level === "strong" ? "warning" : "info",
      );
    },
  });
}
