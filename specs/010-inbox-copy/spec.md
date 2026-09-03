# Feature Spec: Inbox Copy

Status: approved implementation slice

## User Need

As a Copicu user, I want a dedicated copy gesture that keeps selected clipboard content in a durable Inbox and places pending Inbox clips before ordinary history, so important copies do not get buried by routine `Ctrl+C` activity.

## Interaction

- The default Inbox copy shortcut is `Ctrl+Alt+I` and is editable in Settings > Hotkeys.
- Triggering Inbox copy leaves focus in the current external application, performs one normal copy after the chord is released, and marks the resulting capture as Inbox.
- A copy that produces no clipboard change times out without modifying an older item.
- Recopying existing content through Inbox copy promotes the deduplicated item and returns it to Inbox.
- Ordinary `Ctrl+C` remains untouched.
- Pending Inbox items are ordered before ordinary history in the default picker feed and carry a compact Inbox affordance.
- `Catalog` opens the existing metadata editor. Saving metadata removes the item from Inbox; cancelling preserves it.
- `Remove from Inbox` removes only Inbox state. It never deletes clipboard history.
- Inbox state survives picker hide/show and app restarts.

## Data

`clipboard_items` gains:

- `is_inbox INTEGER NOT NULL DEFAULT 0`
- `inbox_at_unix_ms INTEGER NULL`

Inbox is item state, not a tag, saved search, capture context or scenario property. Search supports `is:inbox` and `is:not-inbox` for the searchable Inbox entry and diagnostics.

## Ordering And Retention

- Default history ordering is pending Inbox first by `inbox_at_unix_ms DESC`, then ordinary recency by the existing ordering.
- Removing an item from Inbox returns it to its normal recency position.
- Explicit search keeps the same Inbox-first ordering among matching results.
- Retention pruning does not delete pending Inbox items. The configured retention count applies to non-Inbox history, so total rows may temporarily exceed it.

## Shortcut Safety

- Inbox copy uses the existing native global-shortcut registry and conflict reporting.
- The configurable shortcut must be a simple global chord.
- It is reserved against picker, command palette, metadata, active-item navigation, paste-next, saved-search and script shortcuts.
- The callback runs after chord release and, before synthesizing `Ctrl+C`, waits for Windows to report `Ctrl`, `Alt`, `Shift` and `Win` physically released. If modifiers remain pressed past the bounded wait, it injects no text and arms no capture.
- A bounded pending request correlates the next clipboard change with Inbox copy. Expired requests cannot affect later ordinary copies.

## Compact Navigation Cutover

- Public UI copy renames Saved Views to **Saved searches** and Scenarios to **Capture modes** without renaming persisted tables or internal compatibility contracts.
- The picker overflow menu no longer expands every saved search and capture mode inline.
- A compact `Organize` submenu exposes Saved searches, Capture modes and Tags entry points.
- The Command Palette remains the searchable catalog for all saved searches.
- Capture modes use a compact switcher entry; an active mode exposes its name and Stop without listing every mode at the top level.
- Historical `capture_tags` on saved views remains inert compatibility data and is not presented as Inbox.

## Non-Goals

- Intercepting or replacing ordinary `Ctrl+C`.
- Automatic AI classification.
- Multiple Inbox categories, nested inboxes or per-tag copy shortcuts.
- Restoring active Capture modes after process restart.
- Replacing the existing metadata editor or Command Palette.

## Acceptance Criteria

1. `Ctrl+Alt+I` copies text and images from the focused external application into Inbox without opening or focusing Copicu.
2. The shortcut can be changed in Settings and invalid/conflicting values are rejected without losing the previous working registration.
3. A clipboard change within the bounded request marks the inserted or deduplicated item as Inbox; timeout leaves prior history unchanged.
4. Inbox items survive restart, sort before normal history and are protected from retention pruning.
5. Catalog save clears Inbox after metadata persists; cancel does not. Remove from Inbox preserves the history item.
6. The picker menu stays compact regardless of saved-search or capture-mode count.
7. Focused Rust/storage tests, frontend build, focal visual tests and a native external-app copy smoke pass.
