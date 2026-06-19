import type { EnrichmentSettings, EnterAction } from "./contracts";
import type { ThemeId, ThemeSetting } from "../themeCatalog";

export type AppSettings = {
  schemaVersion: 1;
  general: {
    globalShortcut: string;
    launchOnStartup: boolean;
  };
  picker: {
    hideOnFocusLost: boolean;
    enterAction: EnterAction;
    promoteActiveOnCopy: boolean;
    pinToggleShortcut: string;
    settingsShortcut: string;
  };
  history: {
    retentionCount: number;
  };
  appearance: {
    theme: ThemeSetting;
    themeId: ThemeId;
  };
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
    launchOnStartup: false,
  },
  picker: {
    hideOnFocusLost: true,
    enterAction: "copy",
    promoteActiveOnCopy: true,
    pinToggleShortcut: "F8",
    settingsShortcut: "Ctrl+,",
  },
  history: {
    retentionCount: 0,
  },
  appearance: {
    theme: "system",
    themeId: "default",
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

export function normalizeSettings(settings: Partial<AppSettings> = {}): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    general: { ...DEFAULT_SETTINGS.general, ...settings.general },
    picker: { ...DEFAULT_SETTINGS.picker, ...settings.picker },
    history: { ...DEFAULT_SETTINGS.history, ...settings.history },
    appearance: { ...DEFAULT_SETTINGS.appearance, ...settings.appearance },
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
