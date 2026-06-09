import { createTheme } from "@mantine/core";
import { MANTINE_THEME_COLORS } from "./themeCatalog";

export const copicuMantineTheme = createTheme({
  primaryColor: "copicuDefault",
  fontFamily: "\"Aptos\", \"Segoe UI\", system-ui, sans-serif",
  fontFamilyMonospace: "\"Cascadia Mono\", \"Consolas\", monospace",
  defaultRadius: 5,
  colors: MANTINE_THEME_COLORS,
  components: {
    Input: {
      styles: {
        input: {
          width: "100%",
          minWidth: 0,
          border: "1px solid var(--line)",
          borderRadius: 5,
          background: "var(--surface)",
          color: "var(--ink)",
          fontSize: "0.82rem",
        },
      },
    },
    InputWrapper: {
      styles: {
        label: {
          color: "var(--muted)",
          fontSize: "0.7rem",
          fontWeight: 900,
          textTransform: "uppercase",
        },
      },
    },
    Button: {
      defaultProps: {
        size: "xs",
        radius: 5,
      },
    },
    ActionIcon: {
      defaultProps: {
        size: "sm",
        radius: 5,
        variant: "subtle",
      },
    },
    TextInput: {
      defaultProps: {
        size: "xs",
        radius: 5,
      },
    },
    Textarea: {
      defaultProps: {
        size: "xs",
        radius: 5,
      },
    },
    NumberInput: {
      defaultProps: {
        size: "xs",
        radius: 5,
        clampBehavior: "strict",
      },
    },
    Select: {
      defaultProps: {
        size: "xs",
        radius: 5,
      },
    },
    Switch: {
      defaultProps: {
        size: "xs",
      },
    },
    Checkbox: {
      defaultProps: {
        size: "xs",
        radius: 4,
      },
    },
    Menu: {
      defaultProps: {
        shadow: "sm",
        radius: 6,
      },
    },
    Badge: {
      defaultProps: {
        size: "sm",
        radius: "xl",
      },
      styles: {
        root: {
          display: "inline-flex",
          width: "fit-content",
          maxWidth: "100%",
          minHeight: 24,
          border: "1px solid var(--line)",
          background: "var(--surface-muted)",
          padding: "4px 8px",
          color: "var(--ink-soft)",
          fontSize: "0.72rem",
          fontWeight: 850,
          lineHeight: 1.1,
          overflowWrap: "anywhere",
          textTransform: "none",
        },
      },
    },
    Tabs: {
      defaultProps: {
        radius: 5,
      },
    },
    Tooltip: {
      defaultProps: {
        withArrow: true,
        openDelay: 250,
      },
    },
    Kbd: {
      defaultProps: {
        size: "xs",
      },
    },
    Loader: {
      defaultProps: {
        size: "xs",
      },
    },
  },
});
