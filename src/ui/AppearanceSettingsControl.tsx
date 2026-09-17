import { SegmentedControl, UnstyledButton } from "@mantine/core";
import Flag from "lucide-react/dist/esm/icons/flag.mjs";
import MoreVertical from "lucide-react/dist/esm/icons/more-vertical.mjs";
import Trash2 from "lucide-react/dist/esm/icons/trash-2.mjs";
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useMemo,
  useRef,
} from "react";
import {
  COPICU_THEME_PRESETS,
  getActionSize,
  getDensityMetrics,
  getEffectiveColorScheme,
  getImagePreviewHeight,
  type ActionSizeSetting,
  type AppearanceSettings,
  type DensitySetting,
  type ImageHoverPreviewSetting,
  type ImagePreviewSetting,
  type ItemActionsSetting,
  type ItemDetailsSetting,
  type TextPreviewLinesSetting,
  type ThemeId,
  type ThemeSetting,
} from "../themeCatalog";

type AppearanceSettingsControlProps = {
  appearance: AppearanceSettings;
  onChange: (appearance: AppearanceSettings) => void;
};

const COLOR_MODE_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
const DENSITY_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "compact", label: "Compact" },
];
const IMAGE_PREVIEW_OPTIONS = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];
const IMAGE_HOVER_PREVIEW_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "hover", label: "Hover" },
  { value: "ctrlHover", label: "Ctrl + hover" },
  { value: "altHover", label: "Alt + hover" },
];
const ITEM_ACTION_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "inline", label: "Inline" },
  { value: "menuOnly", label: "Menu only" },
];
const ACTION_SIZE_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];
const TEXT_PREVIEW_OPTIONS = [
  { value: "2", label: "2 lines" },
  { value: "4", label: "4 lines" },
  { value: "6", label: "6 lines" },
];
const ITEM_DETAILS_OPTIONS = [
  { value: "always", label: "Always" },
  { value: "selectedOnly", label: "Selected only" },
];

function AppearanceField({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="appearance-settings-field">
      <div className="appearance-settings-field-copy">
        <span className="appearance-settings-field-label">{label}</span>
        <span className="appearance-settings-field-description">{description}</span>
      </div>
      {children}
    </div>
  );
}

export function AppearanceSettingsControl({
  appearance,
  onChange,
}: AppearanceSettingsControlProps) {
  const themePickerLabelId = useId();
  const themeButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const effectiveScheme = getEffectiveColorScheme(appearance.theme);
  const densityMetrics = getDensityMetrics(appearance.density);
  const selectedPreset =
    COPICU_THEME_PRESETS.find((preset) => preset.id === appearance.themeId) ??
    COPICU_THEME_PRESETS[0];
  const previewTokens = selectedPreset[effectiveScheme];
  const previewStyle = useMemo(
    () =>
      ({
        "--appearance-preview-background": previewTokens.background,
        "--surface": previewTokens.surface,
        "--surface-raised": previewTokens.surfaceRaised,
        "--surface-muted": previewTokens.surfaceMuted,
        "--ink": previewTokens.ink,
        "--ink-soft": previewTokens.inkSoft,
        "--muted": previewTokens.muted,
        "--line": previewTokens.line,
        "--line-strong": previewTokens.lineStrong,
        "--metadata-bg": previewTokens.metadataBg,
        "--accent": previewTokens.accent,
        "--accent-soft": previewTokens.accentSoft,
        "--danger": previewTokens.danger,
        "--feed-item-min-height": `${densityMetrics.minHeight}px`,
        "--feed-item-padding-y": `${densityMetrics.paddingY}px`,
        "--feed-item-gap": `${densityMetrics.gap}px`,
        "--image-preview-max-height": `${getImagePreviewHeight(appearance.imagePreview)}px`,
        "--item-action-size": `${getActionSize(appearance.actionSize)}px`,
        "--text-preview-max-height": `${appearance.textPreviewLines * 1.38}em`,
      }) as CSSProperties,
    [appearance.actionSize, appearance.imagePreview, appearance.textPreviewLines, densityMetrics, previewTokens],
  );

  const selectTheme = (themeId: ThemeId) => {
    onChange({ ...appearance, themeId });
  };
  const focusTheme = (index: number) => {
    const normalizedIndex =
      (index + COPICU_THEME_PRESETS.length) % COPICU_THEME_PRESETS.length;
    selectTheme(COPICU_THEME_PRESETS[normalizedIndex].id);
    themeButtonRefs.current[normalizedIndex]?.focus();
  };
  const handleThemeKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusTheme(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusTheme(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusTheme(0);
        break;
      case "End":
        event.preventDefault();
        focusTheme(COPICU_THEME_PRESETS.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        selectTheme(COPICU_THEME_PRESETS[index].id);
        break;
    }
  };
  const segmented = (
    label: string,
    value: string,
    data: Array<{ value: string; label: string }>,
    onValue: (value: string) => void,
  ) => (
    <SegmentedControl
      className="appearance-segmented-control"
      aria-label={label}
      size="sm"
      fullWidth
      value={value}
      data={data}
      onChange={onValue}
    />
  );

  return (
    <div className="appearance-settings-control">
      <AppearanceField label="Color mode" description="Follow Windows or keep one mode.">
        {segmented("Color mode", appearance.theme, COLOR_MODE_OPTIONS, (theme) =>
          onChange({ ...appearance, theme: theme as ThemeSetting }))}
      </AppearanceField>

      <div className="appearance-settings-field appearance-settings-themes">
        <div className="appearance-settings-field-copy">
          <span id={themePickerLabelId} className="appearance-settings-field-label">Theme</span>
          <span className="appearance-settings-field-description">Choose the colors used across Copicu.</span>
        </div>
        <div className="appearance-theme-grid" role="radiogroup" aria-labelledby={themePickerLabelId}>
          {COPICU_THEME_PRESETS.map((preset, index) => {
            const selected = preset.id === appearance.themeId;
            return (
              <UnstyledButton
                key={preset.id}
                ref={(node) => { themeButtonRefs.current[index] = node; }}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                className={`appearance-theme-option${selected ? " is-selected" : ""}`}
                onClick={() => selectTheme(preset.id)}
                onKeyDown={(event) => handleThemeKeyDown(event, index)}
              >
                <span className="appearance-theme-swatch" aria-hidden="true">
                  <span className="appearance-theme-swatch-half is-light" style={{ backgroundColor: preset.light.surface }}>
                    <span style={{ backgroundColor: preset.light.accent }} />
                  </span>
                  <span className="appearance-theme-swatch-half is-dark" style={{ backgroundColor: preset.dark.surface }}>
                    <span style={{ backgroundColor: preset.dark.accent }} />
                  </span>
                </span>
                <span className="appearance-theme-option-copy">
                  <span className="appearance-theme-option-name">{preset.label}</span>
                  <span className="appearance-theme-option-description">{preset.description}</span>
                </span>
                <span className="appearance-theme-option-check" aria-hidden="true">{selected ? "✓" : ""}</span>
              </UnstyledButton>
            );
          })}
        </div>
      </div>

      <AppearanceField label="Density" description="Adjust row spacing without changing text size.">
        {segmented("Density", appearance.density, DENSITY_OPTIONS, (density) =>
          onChange({ ...appearance, density: density as DensitySetting }))}
      </AppearanceField>
      <AppearanceField label="Image preview" description="Set image and Markdown image height in the picker.">
        {segmented("Image preview", appearance.imagePreview, IMAGE_PREVIEW_OPTIONS, (imagePreview) =>
          onChange({ ...appearance, imagePreview: imagePreview as ImagePreviewSetting }))}
      </AppearanceField>
      <AppearanceField label="Image hover zoom" description="Show a larger floating image after hovering for 500 ms.">
        {segmented("Image hover zoom", appearance.imageHoverPreview, IMAGE_HOVER_PREVIEW_OPTIONS, (imageHoverPreview) =>
          onChange({ ...appearance, imageHoverPreview: imageHoverPreview as ImageHoverPreviewSetting }))}
      </AppearanceField>
      <AppearanceField label="Item actions" description="Show Mark, Delete and More inline or keep them in one menu.">
        {segmented("Item actions", appearance.itemActions, ITEM_ACTION_OPTIONS, (itemActions) =>
          onChange({ ...appearance, itemActions: itemActions as ItemActionsSetting }))}
      </AppearanceField>
      <AppearanceField label="Action size" description="Small is icon-only, Medium is 32 px and Large is 44 px. Auto uses Medium with a mouse and Large on touch.">
        {segmented("Action size", appearance.actionSize, ACTION_SIZE_OPTIONS, (actionSize) =>
          onChange({ ...appearance, actionSize: actionSize as ActionSizeSetting }))}
      </AppearanceField>
      <AppearanceField label="Text preview" description="Limit collapsed text without changing the full preview.">
        {segmented("Text preview lines", String(appearance.textPreviewLines), TEXT_PREVIEW_OPTIONS, (lines) =>
          onChange({ ...appearance, textPreviewLines: Number(lines) as TextPreviewLinesSetting }))}
      </AppearanceField>
      <AppearanceField label="Item details" description="Titles stay visible; tags and notes can follow selection.">
        {segmented("Item details", appearance.itemDetails, ITEM_DETAILS_OPTIONS, (itemDetails) =>
          onChange({ ...appearance, itemDetails: itemDetails as ItemDetailsSetting }))}
      </AppearanceField>

      <div className="appearance-settings-field appearance-settings-preview">
        <div className="appearance-settings-field-copy">
          <span className="appearance-settings-field-label">Preview</span>
          <span className="appearance-settings-field-description">Synthetic items only. No clipboard content is read.</span>
        </div>
        <div
          className="appearance-preview"
          style={previewStyle}
          data-image-preview={appearance.imagePreview}
          data-item-actions={appearance.itemActions}
          data-action-size={appearance.actionSize}
          data-item-details={appearance.itemDetails}
          aria-label={`${selectedPreset.label} ${effectiveScheme} appearance preview`}
        >
          <div className="appearance-preview-feed">
            <div className="feed-item appearance-preview-row">
              <span className="item-main">
                <span className="item-title">Keyboard notes</span>
                <span className="item-metadata"><span>reference</span><span>Review shortcuts</span></span>
              </span>
              <span className="text-preview"><pre>{"First line\nSecond line\nThird line\nFourth line\nFifth line\nSixth line"}</pre></span>
            </div>
            <div className="feed-item appearance-preview-row is-selected">
              <span className="item-main">
                <span className="item-title">Design reference</span>
                <span className="item-metadata"><span>image</span><span>Selected clip</span></span>
              </span>
              <span className="appearance-preview-image" aria-label="Synthetic image preview" />
              <span className="appearance-preview-actions" aria-hidden="true">
                <span className="is-mark"><Flag size={16} strokeWidth={2.1} /></span>
                <span className="is-delete"><Trash2 size={16} strokeWidth={2.2} /></span>
                <span className="is-menu"><MoreVertical size={16} strokeWidth={2.3} /></span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
