import { SegmentedControl, UnstyledButton } from "@mantine/core";
import {
  type CSSProperties,
  type KeyboardEvent,
  useId,
  useMemo,
  useRef,
} from "react";
import {
  COPICU_THEME_PRESETS,
  getDensityMetrics,
  getEffectiveColorScheme,
  type DensitySetting,
  type ThemeId,
  type ThemeSetting,
} from "../themeCatalog";


type AppearanceDraft = {
  theme: ThemeSetting;
  themeId: ThemeId;
  density: DensitySetting;
};

type AppearanceSettingsControlProps = {
  appearance: AppearanceDraft;
  onChange: (appearance: AppearanceDraft) => void;
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
        "--feed-item-min-height": `${densityMetrics.minHeight}px`,
        "--feed-item-padding-y": `${densityMetrics.paddingY}px`,
        "--feed-item-gap": `${densityMetrics.gap}px`,
      }) as CSSProperties,
    [densityMetrics, previewTokens],
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

  return (
    <div className="appearance-settings-control">
      <div className="appearance-settings-field appearance-settings-color-mode">
        <div className="appearance-settings-field-copy">
          <span className="appearance-settings-field-label">Color mode</span>
          <span className="appearance-settings-field-description">
            Follow Windows or keep one mode.
          </span>
        </div>
        <SegmentedControl
          className="appearance-segmented-control appearance-color-mode-control"
          aria-label="Color mode"
          size="sm"
          fullWidth
          value={appearance.theme}
          data={COLOR_MODE_OPTIONS}
          onChange={(theme) =>
            onChange({ ...appearance, theme: theme as ThemeSetting })
          }
        />
      </div>

      <div className="appearance-settings-field appearance-settings-themes">
        <div className="appearance-settings-field-copy">
          <span
            id={themePickerLabelId}
            className="appearance-settings-field-label"
          >
            Theme
          </span>
          <span className="appearance-settings-field-description">
            Choose the colors used across Copicu.
          </span>
        </div>
        <div
          className="appearance-theme-grid"
          role="radiogroup"
          aria-labelledby={themePickerLabelId}
        >
          {COPICU_THEME_PRESETS.map((preset, index) => {
            const selected = preset.id === appearance.themeId;
            return (
              <UnstyledButton
                key={preset.id}
                ref={(node) => {
                  themeButtonRefs.current[index] = node;
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                className={`appearance-theme-option${selected ? " is-selected" : ""}`}
                onClick={() => selectTheme(preset.id)}
                onKeyDown={(event) => handleThemeKeyDown(event, index)}
              >
                <span className="appearance-theme-swatch" aria-hidden="true">
                  <span
                    className="appearance-theme-swatch-half is-light"
                    style={{ backgroundColor: preset.light.surface }}
                  >
                    <span style={{ backgroundColor: preset.light.accent }} />
                  </span>
                  <span
                    className="appearance-theme-swatch-half is-dark"
                    style={{ backgroundColor: preset.dark.surface }}
                  >
                    <span style={{ backgroundColor: preset.dark.accent }} />
                  </span>
                </span>
                <span className="appearance-theme-option-copy">
                  <span className="appearance-theme-option-name">{preset.label}</span>
                  <span className="appearance-theme-option-description">
                    {preset.description}
                  </span>
                </span>
                <span className="appearance-theme-option-check" aria-hidden="true">
                  {selected ? "✓" : ""}
                </span>
              </UnstyledButton>
            );
          })}
        </div>
      </div>

      <div className="appearance-settings-field appearance-settings-density">
        <div className="appearance-settings-field-copy">
          <span className="appearance-settings-field-label">Density</span>
          <span className="appearance-settings-field-description">
            Adjust row spacing without changing text size.
          </span>
        </div>
        <SegmentedControl
          className="appearance-segmented-control appearance-density-control"
          aria-label="Density"
          size="sm"
          fullWidth
          value={appearance.density}
          data={DENSITY_OPTIONS}
          onChange={(density) =>
            onChange({ ...appearance, density: density as DensitySetting })
          }
        />
      </div>

      <div className="appearance-settings-field appearance-settings-preview">
        <div className="appearance-settings-field-copy">
          <span className="appearance-settings-field-label">Preview</span>
          <span className="appearance-settings-field-description">
            Theme and spacing before you save.
          </span>
        </div>
        <div
          className="appearance-preview"
          style={previewStyle}
          aria-label={`${selectedPreset.label} ${effectiveScheme} preview with ${appearance.density} density`}
        >
          <div className="appearance-preview-feed" aria-hidden="true">
            <div className="feed-item appearance-preview-row">
              <span className="item-main" />
              <span className="text-preview">
                <pre>{"const activeClip = history[0];"}</pre>
              </span>
            </div>
            <div className="feed-item appearance-preview-row is-selected">
              <span className="item-main">
                <span className="item-title">Release notes</span>
                <span className="item-metadata">
                  <span>reference</span>
                  <span>Saved link</span>
                </span>
              </span>
              <span className="text-preview">
                <pre>https://example.test/releases</pre>
              </span>
              <span className="appearance-preview-actions">
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
