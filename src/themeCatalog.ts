import type { MantineColorsTuple } from "@mantine/core";

export type ThemeSetting = "system" | "light" | "dark";
export type ThemeId =
  | "default"
  | "graphite"
  | "code"
  | "highContrast"
  | "midnight"
  | "blueprint"
  | "moss"
  | "rose";

export type AppearanceSettings = {
  theme: ThemeSetting;
  themeId: ThemeId;
};

type SchemeTokens = {
  color: string;
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceMuted: string;
  ink: string;
  inkSoft: string;
  muted: string;
  line: string;
  lineStrong: string;
  accent: string;
  accentSoft: string;
  success: string;
  warning: string;
  danger: string;
  shadow: string;
  shadowStrong: string;
  checkerA: string;
  checkerB: string;
  imageBg: string;
  metadataBg: string;
  menuButtonBg: string;
  errorBg: string;
  errorLine: string;
  toastInfoBg: string;
  toastSuccessBg: string;
  toastWarningBg: string;
  toastDangerBg: string;
  overlayBg: string;
  focusRing: string;
};

type ThemePreset = {
  id: ThemeId;
  label: string;
  description: string;
  search: string;
  primaryColor: string;
  mantineColor: MantineColorsTuple;
  light: SchemeTokens;
  dark: SchemeTokens;
};

const defaultLight: SchemeTokens = {
  color: "#161a1d",
  background: "#eef0ef",
  surface: "#fbfbfa",
  surfaceRaised: "#ffffff",
  surfaceMuted: "#f1f3f2",
  ink: "#161a1d",
  inkSoft: "#374047",
  muted: "#69747a",
  line: "#d2d8d5",
  lineStrong: "#aeb9b3",
  accent: "#245f53",
  accentSoft: "#e4eee9",
  success: "#236947",
  warning: "#8a5a00",
  danger: "#9b3535",
  shadow: "rgb(28 35 32 / 14%)",
  shadowStrong: "rgb(28 35 32 / 18%)",
  checkerA: "#e8ecea",
  checkerB: "#fff",
  imageBg: "#8da4a1",
  metadataBg: "rgb(255 255 255 / 54%)",
  menuButtonBg: "rgb(255 255 255 / 82%)",
  errorBg: "#fff7f7",
  errorLine: "#ead0d0",
  toastInfoBg: "#f6faf8",
  toastSuccessBg: "#eff8f2",
  toastWarningBg: "#fff8e8",
  toastDangerBg: "#fff2f2",
  overlayBg: "rgb(238 240 239 / 86%)",
  focusRing: "rgb(36 95 83 / 12%)",
};

const defaultDark: SchemeTokens = {
  color: "#e4eeeb",
  background: "#15191b",
  surface: "#1c2224",
  surfaceRaised: "#22292b",
  surfaceMuted: "#182022",
  ink: "#e4eeeb",
  inkSoft: "#c1d1cc",
  muted: "#8fa09b",
  line: "#344144",
  lineStrong: "#536366",
  accent: "#77cbb8",
  accentSoft: "#163637",
  success: "#8ce2a9",
  warning: "#f0bd63",
  danger: "#ff8f8f",
  shadow: "rgb(0 0 0 / 35%)",
  shadowStrong: "rgb(0 0 0 / 48%)",
  checkerA: "#2b3436",
  checkerB: "#1f2729",
  imageBg: "#102c31",
  metadataBg: "rgb(119 203 184 / 10%)",
  menuButtonBg: "rgb(34 41 43 / 88%)",
  errorBg: "#341f22",
  errorLine: "#653036",
  toastInfoBg: "#1d292b",
  toastSuccessBg: "#173123",
  toastWarningBg: "#302819",
  toastDangerBg: "#341f22",
  overlayBg: "rgb(12 16 17 / 82%)",
  focusRing: "rgb(119 203 184 / 18%)",
};

function theme(id: ThemeId, label: string, description: string, search: string, primaryColor: string, mantineColor: MantineColorsTuple, light: Partial<SchemeTokens>, dark: Partial<SchemeTokens>): ThemePreset {
  return {
    id,
    label,
    description,
    search,
    primaryColor,
    mantineColor,
    light: { ...defaultLight, ...light },
    dark: { ...defaultDark, ...dark },
  };
}

export const COPICU_THEME_PRESETS: ThemePreset[] = [
  theme(
    "default",
    "Default",
    "Quiet teal surfaces.",
    "default teal original",
    "copicuDefault",
    ["#e4eee9", "#c6ddd5", "#a6cbc0", "#83b7a9", "#65a394", "#4a8d7f", "#367567", "#245f53", "#17483f", "#0d332d"],
    {},
    {},
  ),
  theme(
    "graphite",
    "Graphite",
    "Cool neutral workspace.",
    "graphite slate gray grey neutral",
    "copicuGraphite",
    ["#e3edf2", "#cbdce4", "#a8c3cf", "#84a7b6", "#638da1", "#4c788d", "#3d5f70", "#314d5c", "#253b47", "#192a33"],
    {
      surface: "#f7f8f8",
      surfaceMuted: "#eceff0",
      ink: "#121517",
      inkSoft: "#30383d",
      muted: "#637077",
      line: "#cbd2d5",
      lineStrong: "#a7b1b6",
      accent: "#3d5f70",
      accentSoft: "#e3edf2",
      imageBg: "#899aa2",
      metadataBg: "rgb(61 95 112 / 8%)",
      focusRing: "rgb(61 95 112 / 14%)",
    },
    {
      surface: "#1b1f22",
      surfaceRaised: "#23282c",
      surfaceMuted: "#161b1e",
      ink: "#edf3f4",
      inkSoft: "#c9d4d8",
      muted: "#94a2a8",
      line: "#354046",
      lineStrong: "#59666d",
      accent: "#9bc7d8",
      accentSoft: "#1d3740",
      imageBg: "#152b33",
      metadataBg: "rgb(155 199 216 / 10%)",
      focusRing: "rgb(155 199 216 / 20%)",
    },
  ),
  theme(
    "code",
    "Code",
    "Green-tinted editor feel.",
    "code terminal green editor",
    "copicuCode",
    ["#e4f1e8", "#c9e4d1", "#a6d1b3", "#80bd91", "#61a974", "#45945a", "#315f3f", "#254d31", "#193b24", "#102817"],
    {
      surface: "#f8faf7",
      surfaceMuted: "#edf3ed",
      ink: "#131a16",
      inkSoft: "#2f4137",
      muted: "#627268",
      line: "#cbd9cf",
      lineStrong: "#9fb3a7",
      accent: "#315f3f",
      accentSoft: "#e4f1e8",
      success: "#1f6f42",
      imageBg: "#80998a",
      metadataBg: "rgb(49 95 63 / 8%)",
      focusRing: "rgb(49 95 63 / 14%)",
    },
    {
      surface: "#18201b",
      surfaceRaised: "#202a24",
      surfaceMuted: "#141b17",
      ink: "#e9f4ec",
      inkSoft: "#c3d7ca",
      muted: "#91a597",
      line: "#33443a",
      lineStrong: "#53695b",
      accent: "#95d5a8",
      accentSoft: "#173922",
      success: "#9ae5ad",
      imageBg: "#132d1d",
      metadataBg: "rgb(149 213 168 / 10%)",
      focusRing: "rgb(149 213 168 / 20%)",
    },
  ),
  theme(
    "highContrast",
    "High contrast",
    "Maximum readability.",
    "high contrast accessibility readable",
    "copicuHighContrast",
    ["#d9f3fa", "#b5e8f6", "#86d9ee", "#50c6e4", "#1eb3d8", "#0098bd", "#004f63", "#003f50", "#002f3c", "#001f28"],
    {
      surface: "#ffffff",
      surfaceMuted: "#f0f2f4",
      ink: "#050708",
      inkSoft: "#171d21",
      muted: "#46515a",
      line: "#9aa4aa",
      lineStrong: "#5d6a72",
      accent: "#004f63",
      accentSoft: "#d9f3fa",
      danger: "#8f1d1d",
      shadow: "rgb(0 0 0 / 18%)",
      shadowStrong: "rgb(0 0 0 / 26%)",
      focusRing: "rgb(0 79 99 / 24%)",
    },
    {
      surface: "#0b0d0f",
      surfaceRaised: "#111519",
      surfaceMuted: "#050708",
      ink: "#ffffff",
      inkSoft: "#eef5f7",
      muted: "#b8c5cb",
      line: "#5f6e76",
      lineStrong: "#9bacb4",
      accent: "#82dfff",
      accentSoft: "#063342",
      danger: "#ffb0b0",
      shadow: "rgb(0 0 0 / 48%)",
      shadowStrong: "rgb(0 0 0 / 62%)",
      focusRing: "rgb(130 223 255 / 28%)",
    },
  ),
  theme(
    "midnight",
    "Midnight",
    "Deep blue-gray focus mode.",
    "midnight dark blue focus",
    "copicuMidnight",
    ["#e0edf6", "#c1dceb", "#99c4dd", "#6ea8cc", "#4c8fbc", "#3378aa", "#235f8b", "#1a4b70", "#123754", "#0b2539"],
    {
      background: "#eef3f7",
      surface: "#f9fbfc",
      surfaceMuted: "#edf3f7",
      ink: "#111922",
      inkSoft: "#2e4254",
      muted: "#647887",
      line: "#ccd8e1",
      lineStrong: "#9eb1bf",
      accent: "#235f8b",
      accentSoft: "#e0edf6",
      imageBg: "#7f94a7",
      metadataBg: "rgb(35 95 139 / 8%)",
      focusRing: "rgb(35 95 139 / 15%)",
    },
    {
      background: "#0d141c",
      surface: "#141d27",
      surfaceRaised: "#1b2632",
      surfaceMuted: "#101821",
      ink: "#eaf2f8",
      inkSoft: "#c4d4e0",
      muted: "#8fa5b5",
      line: "#2f4050",
      lineStrong: "#526879",
      accent: "#8ac8f2",
      accentSoft: "#123247",
      imageBg: "#0d2839",
      metadataBg: "rgb(138 200 242 / 10%)",
      focusRing: "rgb(138 200 242 / 20%)",
    },
  ),
  theme(
    "blueprint",
    "Blueprint",
    "Crisp technical blue.",
    "blueprint blue technical",
    "copicuBlueprint",
    ["#e5f0ff", "#c9def8", "#a8c7ee", "#82abe2", "#6193d8", "#497fca", "#3269ad", "#27558e", "#1c406d", "#122b49"],
    {
      background: "#edf2f8",
      surface: "#fbfcff",
      surfaceMuted: "#edf3fb",
      ink: "#111827",
      inkSoft: "#334155",
      muted: "#64748b",
      line: "#cbd7e6",
      lineStrong: "#9aabc0",
      accent: "#3269ad",
      accentSoft: "#e5f0ff",
      imageBg: "#879bb4",
      metadataBg: "rgb(50 105 173 / 8%)",
      focusRing: "rgb(50 105 173 / 15%)",
    },
    {
      background: "#0b1220",
      surface: "#111a2b",
      surfaceRaised: "#172338",
      surfaceMuted: "#0d1626",
      ink: "#edf5ff",
      inkSoft: "#c7d7ea",
      muted: "#91a5bd",
      line: "#2b3c55",
      lineStrong: "#536985",
      accent: "#8bbcff",
      accentSoft: "#132f55",
      imageBg: "#112a4b",
      metadataBg: "rgb(139 188 255 / 10%)",
      focusRing: "rgb(139 188 255 / 20%)",
    },
  ),
  theme(
    "moss",
    "Moss",
    "Muted olive green.",
    "moss olive green calm",
    "copicuMoss",
    ["#e8f0e2", "#d2e0c8", "#b3cca5", "#91b67f", "#739f62", "#5d874d", "#486c3d", "#385531", "#293f24", "#1c2a18"],
    {
      background: "#eff2ec",
      surface: "#fbfcf9",
      surfaceMuted: "#eef3ea",
      ink: "#151b13",
      inkSoft: "#344231",
      muted: "#687463",
      line: "#cfd9ca",
      lineStrong: "#a6b49f",
      accent: "#486c3d",
      accentSoft: "#e8f0e2",
      imageBg: "#879b7d",
      metadataBg: "rgb(72 108 61 / 8%)",
      focusRing: "rgb(72 108 61 / 15%)",
    },
    {
      background: "#11170f",
      surface: "#192118",
      surfaceRaised: "#202b1f",
      surfaceMuted: "#141b13",
      ink: "#ecf4e8",
      inkSoft: "#cbd8c4",
      muted: "#98a790",
      line: "#33422f",
      lineStrong: "#586b52",
      accent: "#add69c",
      accentSoft: "#20391a",
      imageBg: "#182c14",
      metadataBg: "rgb(173 214 156 / 10%)",
      focusRing: "rgb(173 214 156 / 20%)",
    },
  ),
  theme(
    "rose",
    "Rose",
    "Muted red accent.",
    "rose red muted accent",
    "copicuRose",
    ["#fae7ea", "#f3ccd3", "#e8a8b2", "#dc808e", "#cf6072", "#bd485e", "#9b3549", "#7b2b3a", "#5b202b", "#3d141c"],
    {
      background: "#f3f0f1",
      surface: "#fffafa",
      surfaceMuted: "#f5eef0",
      ink: "#1d1416",
      inkSoft: "#453137",
      muted: "#79676c",
      line: "#ddccd1",
      lineStrong: "#b99fa7",
      accent: "#9b3549",
      accentSoft: "#fae7ea",
      danger: "#9b3535",
      imageBg: "#a38b91",
      metadataBg: "rgb(155 53 73 / 8%)",
      focusRing: "rgb(155 53 73 / 15%)",
    },
    {
      background: "#171012",
      surface: "#21181b",
      surfaceRaised: "#2b2024",
      surfaceMuted: "#1b1316",
      ink: "#f8ecef",
      inkSoft: "#dec8cf",
      muted: "#ae949d",
      line: "#463238",
      lineStrong: "#72545d",
      accent: "#f0a1b0",
      accentSoft: "#3b1821",
      danger: "#ffb2b2",
      imageBg: "#351c25",
      metadataBg: "rgb(240 161 176 / 10%)",
      focusRing: "rgb(240 161 176 / 20%)",
    },
  ),
];

export const DEFAULT_THEME_ID: ThemeId = "default";
export const THEME_PRESET_OPTIONS = COPICU_THEME_PRESETS.map((preset) => ({
  value: preset.id,
  label: preset.label,
}));

export const THEME_PRESET_SEARCH_TEXT = COPICU_THEME_PRESETS
  .map((preset) => `${preset.label} ${preset.description} ${preset.search}`)
  .join(" ");

export const MANTINE_THEME_COLORS = Object.fromEntries(
  COPICU_THEME_PRESETS.map((preset) => [preset.primaryColor, preset.mantineColor]),
);

export function getThemePreset(themeId: ThemeId) {
  return COPICU_THEME_PRESETS.find((preset) => preset.id === themeId) ?? COPICU_THEME_PRESETS[0];
}

export function getEffectiveColorScheme(theme: ThemeSetting) {
  if (theme === "light" || theme === "dark") {
    return theme;
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function setToken(style: CSSStyleDeclaration, name: string, value: string) {
  style.setProperty(name, value);
}

export function applyCopicuAppearance(root: HTMLElement, appearance: AppearanceSettings) {
  const effectiveScheme = getEffectiveColorScheme(appearance.theme);
  const preset = getThemePreset(appearance.themeId);
  const tokens = preset[effectiveScheme];

  if (appearance.theme === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = appearance.theme;
  }
  root.dataset.themeId = preset.id;
  root.setAttribute("data-mantine-color-scheme", effectiveScheme);
  root.style.colorScheme = effectiveScheme;
  root.style.color = tokens.color;
  root.style.background = tokens.background;

  setToken(root.style, "--surface", tokens.surface);
  setToken(root.style, "--surface-raised", tokens.surfaceRaised);
  setToken(root.style, "--surface-muted", tokens.surfaceMuted);
  setToken(root.style, "--ink", tokens.ink);
  setToken(root.style, "--ink-soft", tokens.inkSoft);
  setToken(root.style, "--muted", tokens.muted);
  setToken(root.style, "--line", tokens.line);
  setToken(root.style, "--line-strong", tokens.lineStrong);
  setToken(root.style, "--accent", tokens.accent);
  setToken(root.style, "--accent-soft", tokens.accentSoft);
  setToken(root.style, "--success", tokens.success);
  setToken(root.style, "--warning", tokens.warning);
  setToken(root.style, "--danger", tokens.danger);
  setToken(root.style, "--shadow", tokens.shadow);
  setToken(root.style, "--shadow-strong", tokens.shadowStrong);
  setToken(root.style, "--checker-a", tokens.checkerA);
  setToken(root.style, "--checker-b", tokens.checkerB);
  setToken(root.style, "--image-bg", tokens.imageBg);
  setToken(root.style, "--metadata-bg", tokens.metadataBg);
  setToken(root.style, "--menu-button-bg", tokens.menuButtonBg);
  setToken(root.style, "--error-bg", tokens.errorBg);
  setToken(root.style, "--error-line", tokens.errorLine);
  setToken(root.style, "--toast-info-bg", tokens.toastInfoBg);
  setToken(root.style, "--toast-success-bg", tokens.toastSuccessBg);
  setToken(root.style, "--toast-warning-bg", tokens.toastWarningBg);
  setToken(root.style, "--toast-danger-bg", tokens.toastDangerBg);
  setToken(root.style, "--overlay-bg", tokens.overlayBg);
  setToken(root.style, "--focus-ring", tokens.focusRing);

  preset.mantineColor.forEach((color, index) => {
    setToken(root.style, `--mantine-color-${preset.primaryColor}-${index}`, color);
    setToken(root.style, `--mantine-primary-color-${index}`, color);
  });
  setToken(root.style, "--mantine-primary-color-filled", tokens.accent);
  setToken(root.style, "--mantine-primary-color-filled-hover", tokens.accent);
  setToken(root.style, "--mantine-primary-color-light", tokens.accentSoft);
  setToken(root.style, "--mantine-primary-color-light-hover", tokens.accentSoft);
  setToken(root.style, "--mantine-primary-color-light-color", tokens.accent);
}
