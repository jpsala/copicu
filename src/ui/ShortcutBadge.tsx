import type { ReactNode } from "react";
import { UiKbd, UiTooltip } from "./controls";

type ShortcutBadgeProps = {
  shortcut: string | null | undefined;
  ariaLabel?: string;
  className?: string;
  tooltip?: ReactNode;
};

export function ShortcutBadge({
  shortcut,
  ariaLabel,
  className,
  tooltip,
}: ShortcutBadgeProps) {
  const normalized = shortcut?.trim();
  if (!normalized) {
    return null;
  }

  const content = (
    <span
      className={["shortcut-badge", className].filter(Boolean).join(" ")}
      aria-label={ariaLabel ?? normalized}
    >
      {normalized
        .split(/,\s+/)
        .filter(Boolean)
        .map((step, index) => (
          <span className="shortcut-badge-step" key={`${step}-${index}`}>
            {step.split("+").map((part) => (
              <UiKbd key={part}>{displayShortcutPart(part)}</UiKbd>
            ))}
          </span>
        ))}
    </span>
  );

  if (!tooltip) {
    return content;
  }

  return <UiTooltip label={tooltip}>{content}</UiTooltip>;
}

function displayShortcutPart(part: string) {
  return part === "Meta" ? "Win" : part;
}
