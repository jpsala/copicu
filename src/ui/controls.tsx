import {
  ActionIcon,
  type ActionIconProps,
  Alert,
  type AlertProps,
  Badge,
  type BadgeProps,
  Button,
  type ButtonProps,
  Checkbox,
  type CheckboxProps,
  Kbd,
  type KbdProps,
  Loader,
  type LoaderProps,
  NumberInput,
  type NumberInputProps,
  Paper,
  type PaperProps,
  Select,
  type SelectProps,
  Switch,
  type SwitchProps,
  Textarea,
  type TextareaProps,
  TextInput,
  type TextInputProps,
  Tooltip,
  type TooltipProps,
  UnstyledButton,
  type UnstyledButtonProps,
} from "@mantine/core";
import {
  forwardRef,
  type CSSProperties,
  type FormEventHandler,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type ReactNode,
} from "react";

type ButtonElementType = "button" | "submit" | "reset";

export const UiButton = forwardRef<
  HTMLButtonElement,
  ButtonProps & {
    type?: ButtonElementType;
    onClick?: MouseEventHandler<HTMLButtonElement>;
    onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
    onMouseDown?: MouseEventHandler<HTMLButtonElement>;
    onContextMenu?: MouseEventHandler<HTMLButtonElement>;
  }
>(function UiButton(props, ref) {
  return <Button ref={ref} {...props} />;
});

export const UiIconButton = forwardRef<
  HTMLButtonElement,
  ActionIconProps & {
    "aria-label": string;
    children?: ReactNode;
    type?: ButtonElementType;
    onClick?: MouseEventHandler<HTMLButtonElement>;
    onMouseDown?: MouseEventHandler<HTMLButtonElement>;
    onContextMenu?: MouseEventHandler<HTMLButtonElement>;
  }
>(function UiIconButton(props, ref) {
  return <ActionIcon ref={ref} {...props} />;
});

export const UiTextInput = forwardRef<HTMLInputElement, TextInputProps>(
  function UiTextInput(props, ref) {
    return <TextInput ref={ref} {...props} />;
  },
);

export const UiTextarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function UiTextarea(props, ref) {
    return <Textarea ref={ref} {...props} />;
  },
);

export const UiNumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function UiNumberInput(props, ref) {
    return <NumberInput ref={ref} {...props} />;
  },
);

export function UiSelect({ comboboxProps, ...props }: SelectProps) {
  return <Select comboboxProps={{ withinPortal: true, ...comboboxProps }} {...props} />;
}

export const UiSwitch = forwardRef<
  HTMLInputElement,
  Omit<SwitchProps, "checked" | "onChange" | "label" | "aria-label"> & {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
  }
>(function UiSwitch({
  label,
  checked,
  onChange,
  ...props
}, ref) {
  return (
    <Switch
      ref={ref}
      aria-label={label}
      checked={checked}
      onChange={(event) => onChange(event.currentTarget.checked)}
      {...props}
    />
  );
});

export function UiCheckbox(props: CheckboxProps) {
  return <Checkbox {...props} />;
}

export function UiBadge(
  props: BadgeProps & {
    title?: string;
    "aria-live"?: "off" | "assertive" | "polite";
  },
) {
  return <Badge {...props} />;
}

export function UiKbd(props: KbdProps) {
  return <Kbd {...props} />;
}

export function UiTooltip(props: TooltipProps) {
  return <Tooltip {...props} />;
}

export function UiLoader(props: LoaderProps) {
  return <Loader {...props} />;
}

export function UiAlert(props: AlertProps) {
  return <Alert {...props} />;
}

export function UiPaper(
  props: PaperProps & {
    children?: ReactNode;
    component?: "div" | "form";
    onSubmit?: FormEventHandler<HTMLFormElement>;
    onKeyDown?: KeyboardEventHandler<HTMLFormElement>;
    role?: string;
    "aria-label"?: string;
    style?: CSSProperties;
  },
) {
  return <Paper {...(props as PaperProps)} />;
}

export const UiUnstyledButton = forwardRef<
  HTMLButtonElement,
  UnstyledButtonProps & {
    children?: ReactNode;
    component?: "button";
    disabled?: boolean;
    role?: string;
    type?: ButtonElementType;
    onClick?: MouseEventHandler<HTMLButtonElement>;
    onMouseDown?: MouseEventHandler<HTMLButtonElement>;
  }
>(function UiUnstyledButton(props, ref) {
  return <UnstyledButton ref={ref} {...props} />;
});
