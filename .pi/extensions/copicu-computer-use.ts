import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";

const PYTHON = "C:/dev/copicu/.codex-run/tools/ahk-mcp/.venv/Scripts/python.exe";
const AHK_MCP_DIR = "C:/dev/copicu/.codex-run/tools/ahk-mcp";
const AHK_EXE = "C:/Program Files/AutoHotkey/v2/AutoHotkey64.exe";

let computerUseQueue: Promise<unknown> = Promise.resolve();

const Actions = [
  "windows",
  "focus",
  "open_picker",
  "window_info",
  "read",
  "uia_tree",
  "uia_find",
  "send",
  "type",
  "click",
  "screenshot",
  "self_test",
  "debug_last",
] as const;

function pyString(value: string): string {
  return JSON.stringify(value);
}

function buildPython(params: {
  action: string;
  target?: string;
  keys?: string;
  text?: string;
  x?: number;
  y?: number;
  button?: string;
  maxDepth?: number;
  maxNodes?: number;
  name?: string;
  controlType?: string;
  screenshotPath?: string;
}): string {
  const target = params.target ?? "Copicu";
  const screenshotPath = params.screenshotPath ?? "C:/dev/copicu/.codex-run/copicu-computer-use.png";
  const button = params.button ?? "left";
  const maxDepth = params.maxDepth ?? 4;
  const maxNodes = params.maxNodes ?? 120;

  return `
import os, sys, traceback
os.environ["AHK_EXE"] = ${pyString(AHK_EXE)}
os.environ.setdefault("AHK_TIMEOUT", "10")
sys.path.insert(0, ${pyString(AHK_MCP_DIR)})
import server

def out(text):
    print(str(text)[:12000])

def run_self_test():
    ahk = server.run_ahk('#Requires AutoHotkey v2.0\\nFileAppend "AHK_OK", "*"\\nExitApp\\n')
    windows = server.run_ahk(server.SCRIPT_WINDOWS).splitlines()[:8]
    uia = server.uia_find(${pyString(target)}, "", "Edit", 5)
    out("self_test:\\n" + "AHK: " + ahk + "\\nwindows(first 8):\\n" + "\\n".join(windows) + "\\nuia_find(Edit):\\n" + uia)

action = ${pyString(params.action)}
target = ${pyString(target)}

try:
    if action == "windows":
        out(server.run_ahk(server.SCRIPT_WINDOWS))
    elif action == "focus":
        out(server.run_ahk(server.SCRIPT_FOCUS.format(target=target)))
    elif action == "open_picker":
        out(server.run_ahk(server.SCRIPT_SEND.format(keys="^+.")))
    elif action == "window_info":
        out(server.run_ahk(server.SCRIPT_WINDOW_INFO, timeout=5))
    elif action == "read":
        if target:
            out(server.run_ahk(server.SCRIPT_READ_TARGET.format(target=target)))
        else:
            out(server.run_ahk(server.SCRIPT_READ))
    elif action == "uia_tree":
        out(server.uia_tree(target, ${maxDepth}, ${maxNodes}))
    elif action == "uia_find":
        out(server.uia_find(target, ${pyString(params.name ?? "")}, ${pyString(params.controlType ?? "")}, 30))
    elif action == "send":
        out(server.run_ahk(server.SCRIPT_SEND.format(keys=${pyString(params.keys ?? "")})))
    elif action == "type":
        out(server.run_ahk(server.SCRIPT_SEND_TEXT.format(text=${pyString(params.text ?? "")})))
    elif action == "click":
        out(server.run_ahk(server.SCRIPT_CLICK.format(x=${params.x ?? 0}, y=${params.y ?? 0}, button=${pyString(button)})))
    elif action == "screenshot":
        path = ${pyString(screenshotPath)}
        out(server.run_ahk(server.SCRIPT_SCREENSHOT.format(target=target, filepath=path.replace('\\\\', '/'), rx=0, ry=0, rw=0, rh=0)) + "\\n" + path)
    elif action == "self_test":
        run_self_test()
    else:
        raise SystemExit(f"Unsupported action: {action}")
except Exception:
    print("[copicu_computer_use Python error]")
    print("action=" + action + " target=" + target)
    traceback.print_exc()
    raise
`;
}

export default function copicuComputerUse(pi: ExtensionAPI) {
  pi.registerTool({
    name: "copicu_computer_use",
    label: "Copicu Computer Use",
    description: "Low-context Windows desktop automation for testing Copicu via the local AHK-MCP engine.",
    promptSnippet: "Operate Copicu desktop UI with compact actions backed by AHK-MCP.",
    promptGuidelines: [
      "Use copicu_computer_use only when JP asks to test or inspect the running Copicu desktop app.",
      "Prefer copicu_computer_use actions windows, focus, read, uia_find, and uia_tree before screenshots to save context.",
      "Use copicu_computer_use screenshot only when visual layout evidence is needed; then read the returned PNG path if needed.",
      "Before typing or clicking with copicu_computer_use, focus/open_picker and verify the active Copicu window when practical.",
    ],
    parameters: Type.Object({
      action: StringEnum(Actions),
      target: Type.Optional(Type.String({ description: "Window title target. Defaults to Copicu." })),
      keys: Type.Optional(Type.String({ description: "AHK Send key sequence for action=send, e.g. {Enter}, ^c, {Down}." })),
      text: Type.Optional(Type.String({ description: "Plain text for action=type." })),
      x: Type.Optional(Type.Integer({ description: "Screen X for click." })),
      y: Type.Optional(Type.Integer({ description: "Screen Y for click." })),
      button: Type.Optional(StringEnum(["left", "right", "middle"] as const)),
      maxDepth: Type.Optional(Type.Integer({ description: "Max UIA tree depth." })),
      maxNodes: Type.Optional(Type.Integer({ description: "Max UIA tree nodes." })),
      name: Type.Optional(Type.String({ description: "Element name search for uia_find." })),
      controlType: Type.Optional(Type.String({ description: "UIA control type search for uia_find, e.g. Button, Edit, Text." })),
      screenshotPath: Type.Optional(Type.String({ description: "PNG output path for screenshot." })),
    }),
    async execute(_toolCallId, params) {
      const run = async () => {
        const tempDir = join(process.cwd(), ".codex-run", "computer-use");
        mkdirSync(tempDir, { recursive: true });
        const lastCallPath = join(tempDir, "last-call.json");

        if (params.action === "debug_last") {
          const text = existsSync(lastCallPath) ? readFileSync(lastCallPath, "utf8") : "No previous computer-use call logged.";
          return {
            content: [{ type: "text", text: text.slice(0, 12000) }],
            details: { action: params.action, lastCallPath },
          };
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const scriptPath = join(tempDir, `call-${timestamp}.py`);
        const python = buildPython(params);
        writeFileSync(scriptPath, python, "utf8");
        writeFileSync(lastCallPath, JSON.stringify({
          startedAt: new Date().toISOString(),
          params,
          scriptPath,
          python,
          status: "running",
        }, null, 2), "utf8");

        const result = await pi.exec(PYTHON, [scriptPath], {
          timeout: 30000,
          env: {
            AHK_EXE,
            AHK_TIMEOUT: "10",
            PYTHONIOENCODING: "utf-8",
            PYTHONUNBUFFERED: "1",
          },
        });

        const output = `${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`.trim();
        const log = {
          finishedAt: new Date().toISOString(),
          params,
          scriptPath,
          lastCallPath,
          python,
          exitCode: result.code,
          stdout: result.stdout,
          stderr: result.stderr,
        };
        writeFileSync(lastCallPath, JSON.stringify(log, null, 2), "utf8");

        const prefix = result.code === 0 ? "" : `[copicu_computer_use failed exit=${result.code}]\nlog: ${lastCallPath}\nscript: ${scriptPath}\n`;
        return {
          content: [{ type: "text", text: `${prefix}${output || `(exit ${result.code}, sin salida)`}`.slice(0, 12000) }],
          details: { code: result.code, action: params.action, lastCallPath, scriptPath },
        };
      };

      const queued = computerUseQueue.then(run, run);
      computerUseQueue = queued.then(() => undefined, () => undefined);
      return queued;
    },
  });
}
