import type { EnrichmentSettings, EnterAction } from "./contracts";
import type { ThemeId, ThemeSetting } from "../themeCatalog";

export type SearchTriggerMode = "realtime" | "enter";
export type EditorFontFamily = "systemMono" | "cascadiaMono" | "consolas" | "uiSans";
export type EditorLineHeight = "compact" | "comfortable" | "relaxed";

export type EditorSettings = {
  fontFamily: EditorFontFamily;
  fontSize: number;
  lineHeight: EditorLineHeight;
  wrapLines: boolean;
  tabSize: 2 | 4 | 8;
  lineNumbers: boolean;
  highlightActiveLine: boolean;
  externalEditorPath: string;
};

export const EDITOR_FONT_OPTIONS = [
  { value: "systemMono", label: "System monospace" },
  { value: "cascadiaMono", label: "Cascadia Mono" },
  { value: "consolas", label: "Consolas" },
  { value: "uiSans", label: "UI sans" },
];

export const EDITOR_LINE_HEIGHT_OPTIONS = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
  { value: "relaxed", label: "Relaxed" },
];

export function editorFontStack(fontFamily: EditorFontFamily): string {
  switch (fontFamily) {
    case "cascadiaMono":
      return '"Cascadia Mono", "Cascadia Code", Consolas, monospace';
    case "consolas":
      return 'Consolas, "Cascadia Mono", monospace';
    case "uiSans":
      return '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif';
    default:
      return 'ui-monospace, "Cascadia Mono", "Cascadia Code", Consolas, monospace';
  }
}

export function editorLineHeightValue(lineHeight: EditorLineHeight): number {
  return lineHeight === "compact" ? 1.35 : lineHeight === "relaxed" ? 1.7 : 1.52;
}

export type AppSettings = {
  schemaVersion: 1;
  general: {
    globalShortcut: string;
    inboxShortcut: string;
    pasteNextShortcut: string;
    launchOnStartup: boolean;
    captureEnabled: boolean;
  };
  autoUpdate: {
    enabled: boolean;
    checkIntervalMinutes: number;
  };
  picker: {
    hideOnFocusLost: boolean;
    enterAction: EnterAction;
    promoteActiveOnCopy: boolean;
    searchTriggerMode: SearchTriggerMode;
    deferStructuredSearchUntilEnter: boolean;
    pinToggleShortcut: string;
    settingsShortcut: string;
    previewShortcut: string;
    externalEditorShortcut: string;
  };
  history: {
    retentionCount: number;
  };
  appearance: {
    theme: ThemeSetting;
    themeId: ThemeId;
  };
  editor: EditorSettings;
  scripts: {
    folderPath: string;
    vscodePath: string;
  };
  enrichment: EnrichmentSettings;
  ai: {
    enabled: boolean;
    endpoint: string;
    model: string;
    apiKey: string;
  };
};

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 1,
  general: {
    globalShortcut: "Ctrl+Shift+,",
    inboxShortcut: "Ctrl+Alt+I",
    pasteNextShortcut: "Ctrl+Alt+F11",
    launchOnStartup: false,
    captureEnabled: true,
  },
  autoUpdate: {
    enabled: true,
    checkIntervalMinutes: 60,
  },
  picker: {
    hideOnFocusLost: true,
    enterAction: "copy",
    promoteActiveOnCopy: true,
    searchTriggerMode: "realtime",
    deferStructuredSearchUntilEnter: false,
    pinToggleShortcut: "F8",
    settingsShortcut: "Ctrl+,",
    previewShortcut: "Alt+Enter",
    externalEditorShortcut: "",
  },
  history: {
    retentionCount: 0,
  },
  appearance: {
    theme: "system",
    themeId: "default",
  },
  editor: {
    fontFamily: "systemMono",
    fontSize: 13,
    lineHeight: "comfortable",
    wrapLines: true,
    tabSize: 4,
    lineNumbers: true,
    highlightActiveLine: true,
    externalEditorPath: "",
  },
  scripts: {
    folderPath: "Documents\\Copicu\\Scripts",
    vscodePath: "",
  },
  enrichment: {
    enabled: true,
    applyMode: "autoApply",
    detectors: {
      path: true,
      url: true,
      json: true,
      code: true,
      secretRisk: true,
    },
  },
  ai: {
    enabled: false,
    endpoint: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4.1-mini",
    apiKey: "",
  },
};

function normalizeSearchTriggerMode(value: unknown): SearchTriggerMode {
  return value === "enter" || value === "manual" ? "enter" : "realtime";
}

export function normalizeSettings(settings: Partial<AppSettings> = {}): AppSettings {
  const picker = { ...DEFAULT_SETTINGS.picker, ...settings.picker };
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    general: { ...DEFAULT_SETTINGS.general, ...settings.general },
    autoUpdate: { ...DEFAULT_SETTINGS.autoUpdate, ...settings.autoUpdate },
    picker: { ...picker, searchTriggerMode: normalizeSearchTriggerMode(picker.searchTriggerMode) },
    history: { ...DEFAULT_SETTINGS.history, ...settings.history },
    appearance: { ...DEFAULT_SETTINGS.appearance, ...settings.appearance },
    editor: {
      ...DEFAULT_SETTINGS.editor,
      ...settings.editor,
      fontSize: Math.min(20, Math.max(11, Number(settings.editor?.fontSize) || DEFAULT_SETTINGS.editor.fontSize)),
      tabSize: settings.editor?.tabSize === 2 || settings.editor?.tabSize === 8 ? settings.editor.tabSize : 4,
    },
    scripts: { ...DEFAULT_SETTINGS.scripts, ...settings.scripts },
    enrichment: {
      ...DEFAULT_SETTINGS.enrichment,
      ...settings.enrichment,
      detectors: {
        ...DEFAULT_SETTINGS.enrichment.detectors,
        ...settings.enrichment?.detectors,
      },
    },
    ai: { ...DEFAULT_SETTINGS.ai, ...settings.ai },
  };
}
