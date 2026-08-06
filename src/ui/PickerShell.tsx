import type { ReactNode } from "react";

type PickerShellProps = {
  children: ReactNode;
  className?: string;
  label?: string;
};

function shellClassName(base: string, className?: string) {
  return className ? `${base} ${className}` : base;
}

/**
 * Presentational boundary for the picker header. Search state and IPC remain
 * owned by App; this component only gives the shell a stable semantic region.
 */
export function PickerHeader({ children, className, label = "Picker controls" }: PickerShellProps) {
  return (
    <header className={shellClassName("picker-header", className)} aria-label={label}>
      {children}
    </header>
  );
}

/** Render contextual state only when the caller has an active context. */
export function PickerContextStrip({ children, className, label = "Active picker context" }: PickerShellProps) {
  return (
    <div className={shellClassName("context-strip", className)} role="region" aria-label={label}>
      {children}
    </div>
  );
}

/** Stable live region for short selection/current-item announcements. */
export function PickerStatusAnnouncer({ children, className, label = "Picker status" }: PickerShellProps) {
  return (
    <div
      className={shellClassName("picker-status-announcer", className)}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={label}
    >
      {children}
    </div>
  );
}

/** Contextual multi-selection actions; hidden entirely when there is no selection. */
export function PickerSelectionBar({
  children,
  className,
  label = "Selection actions",
  ariaLabel,
}: PickerShellProps & { ariaLabel?: string }) {
  return (
    <div
      className={shellClassName("selection-action-bar", className)}
      aria-label={ariaLabel ?? label}
      aria-live="polite"
    >
      {children}
    </div>
  );
}

/** Presentational boundary for the semantic virtualized history feed. */
export function PickerFeed({ children, className, label = "Clipboard picker" }: PickerShellProps) {
  return (
    <section className={shellClassName("feed-panel", className)} aria-label={label}>
      {children}
    </section>
  );
}
