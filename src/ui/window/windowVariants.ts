export type CustomWindowVariant =
  | "floatingPicker"
  | "document"
  | "utility"
  | "prompt"
  | "toast";

export type WindowControlId = "pin" | "minimize" | "maximize" | "hide" | "close";

export const DEFAULT_WINDOW_CONTROLS: Record<CustomWindowVariant, WindowControlId[]> = {
  floatingPicker: ["pin", "minimize", "maximize", "hide"],
  document: ["minimize", "maximize", "close"],
  utility: ["pin", "minimize", "close"],
  prompt: ["close"],
  toast: [],
};
