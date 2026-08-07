import type { ChangeEvent, KeyboardEvent, Ref } from "react";

export type FindBarStatus = "idle" | "starting" | "ready" | "empty" | "error";

export type FindBarProps = {
  needle: string;
  total: number;
  currentOrdinal: number | null;
  status: FindBarStatus;
  error?: string | null;
  inputRef?: Ref<HTMLInputElement>;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onPrevious: () => void;
  onNext: () => void;
  onRetry: () => void;
  onClose: () => void;
};

function countLabel(total: number, currentOrdinal: number | null) {
  if (total <= 0 || currentOrdinal === null) {
    return "0 / 0";
  }
  return `${currentOrdinal} / ${total}`;
}

export function FindBar({
  needle,
  total,
  currentOrdinal,
  status,
  error,
  inputRef,
  onChange,
  onKeyDown,
  onPrevious,
  onNext,
  onRetry,
  onClose,
}: FindBarProps) {
  const hasMatches = total > 0 && currentOrdinal !== null;
  const statusText = error
    ?? (status === "starting"
      ? "Searching…"
      : status === "empty"
        ? "No matches in these results"
        : hasMatches
          ? `${countLabel(total, currentOrdinal)} matches`
          : "Type to find in results");

  return (
    <div
      className={`find-bar is-${status}`}
      role="region"
      aria-label="Find in filtered results"
      data-testid="find-bar"
      data-find-status={status}
    >
      <span className="find-bar-label">Find</span>
      <input
        ref={inputRef}
        className="find-input"
        type="search"
        value={needle}
        aria-label="Find in results"
        aria-describedby="find-status"
        placeholder="Find in results"
        autoComplete="off"
        spellCheck={false}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />
      <span
        id="find-status"
        className="find-count"
        aria-live="polite"
        aria-atomic="true"
      >
        {countLabel(total, currentOrdinal)}
      </span>
      <span className="find-status-copy" role="status" aria-live="polite">
        {statusText}
      </span>
      {status === "error" ? (
        <button
          type="button"
          className="find-retry"
          aria-label="Retry Find"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onRetry}
        >
          Retry
        </button>
      ) : null}
      <div className="find-navigation" aria-label="Find navigation">
        <button
          type="button"
          className="find-control"
          aria-label="Previous match"
          title="Previous match (Shift+Enter)"
          disabled={!hasMatches || status === "starting"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onPrevious}
        >
          ↑
        </button>
        <button
          type="button"
          className="find-control"
          aria-label="Next match"
          title="Next match (Enter)"
          disabled={!hasMatches || status === "starting"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onNext}
        >
          ↓
        </button>
        <button
          type="button"
          className="find-control find-close"
          aria-label="Close Find"
          title="Close Find (Escape)"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClose}
        >
          ×
        </button>
      </div>
    </div>
  );
}
