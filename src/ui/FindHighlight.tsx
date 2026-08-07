import { Fragment, type ReactNode } from "react";
import type { FindFieldMatches, FindRange } from "../shared/contracts";

type FindHighlightProps = {
  matches: FindFieldMatches | null | undefined;
  currentOrdinal: number | null;
  className?: string;
  fallback?: ReactNode;
};

type Segment = {
  segment: number;
  startUtf16: number;
  endUtf16: number;
  displayText: string;
};

function clampOffset(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function rangesForSegment(ranges: FindRange[], segment: Segment) {
  return ranges
    .filter((range) => range.segment === segment.segment)
    .sort((left, right) => left.startUtf16 - right.startUtf16);
}

function highlightedSegment(
  segment: Segment,
  ranges: FindRange[],
  currentOrdinal: number | null,
  keyPrefix: string,
) {
  const segmentStart = segment.startUtf16;
  const relevant = rangesForSegment(ranges, segment);
  if (relevant.length === 0) {
    return <Fragment key={`${keyPrefix}:plain`}>{segment.displayText}</Fragment>;
  }

  const pieces: ReactNode[] = [];
  let cursor = 0;
  for (const [index, range] of relevant.entries()) {
    const start = clampOffset(range.startUtf16 - segmentStart, cursor, segment.displayText.length);
    const end = clampOffset(range.endUtf16 - segmentStart, start, segment.displayText.length);
    if (start > cursor) {
      pieces.push(
        <Fragment key={`${keyPrefix}:text:${index}:${cursor}`}>
          {segment.displayText.slice(cursor, start)}
        </Fragment>,
      );
    }
    if (end > start) {
      const current = currentOrdinal !== null && range.ordinal === currentOrdinal;
      pieces.push(
        <mark
          key={`${keyPrefix}:hit:${range.ordinal}:${index}`}
          className={`find-highlight${current ? " is-current" : ""}`}
          data-find-ordinal={range.ordinal}
          data-find-segment={segment.segment}
          aria-current={current ? "true" : undefined}
        >
          {segment.displayText.slice(start, end)}
        </mark>,
      );
      cursor = end;
    }
  }
  if (cursor < segment.displayText.length) {
    pieces.push(
      <Fragment key={`${keyPrefix}:tail:${cursor}`}>
        {segment.displayText.slice(cursor)}
      </Fragment>,
    );
  }
  return pieces;
}

export function FindHighlightedText({
  matches,
  currentOrdinal,
  className,
  fallback = null,
}: FindHighlightProps) {
  if (!matches || (matches.ranges.length === 0 && matches.segments.length === 0)) {
    return fallback;
  }

  const segments: Segment[] = matches.segments.length > 0
    ? matches.segments
    : [{
        segment: 0,
        startUtf16: 0,
        endUtf16: matches.displayText.length,
        displayText: matches.displayText,
      }];
  return (
    <span className={className} data-find-field={matches.field}>
      {segments.map((segment, index) => highlightedSegment(
        segment,
        matches.ranges,
        currentOrdinal,
        `${matches.field}:${segment.segment}:${index}`,
      ))}
    </span>
  );
}

export function findFieldMatches(
  fields: FindFieldMatches[] | undefined,
  field: FindFieldMatches["field"],
) {
  return fields?.find((candidate) => candidate.field === field) ?? null;
}
