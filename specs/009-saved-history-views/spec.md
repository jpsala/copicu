# Feature Spec: Saved History Views

Status: approved dogfood slice

## User Need

As a Copicu user, I want to save a named history query and launch it through an existing script/action hotkey, so I can quickly browse a scoped set of clips without rebuilding the filter each time.

## Current Slice

A saved history view contains a title, a validated structured-history query and an optional hotkey. Settings lets the user create, edit, delete and open views. Its hotkey is registered by Copicu's existing native global-shortcut registry as another route type, not by a separate registry.

Opening a view uses normal picker browse behavior. Persisted views also appear as navigation entries in the main Command Palette alongside History filters and pinned tags:

- choosing a palette navigation entry closes the palette, loads the view query into the normal editable search input and focuses it;
- `Enter` follows the existing `picker.enterAction` setting (`copy` or `paste`);
- `Shift+Enter` performs the existing alternate action;
- Escape keeps normal picker clear/hide behavior;
- no script waits for a selection and no new clipboard policy exists.

## Requirements

- Persist `id`, unique nonempty `title`, query, optional hotkey, `open_mode = browse`, pinned/sort metadata and timestamps.
- Save or update only queries accepted by the existing structured-query parser; a malformed query must not create/update a view.
- A view opens as a normal editable history search; immutable scopes are deferred to future `history.pick()`.
- Opening a view must reuse current picker focus, pagination and activation paths.
- A duplicate, invalid or unsupported hotkey is rejected/reported through the existing native global-shortcut registration path.
- An unfiltered view must be explicit in Settings, not an accidental omitted query.
- Existing `picker.enterAction` is the only activation setting in this slice.
- Saved views join the existing global-shortcut registration and conflict handling path.

## Non-Goals

- Generic `QuickPickCore` extraction.
- Awaitable `history.pick()` API for scripts.
- A separate Quick Pick Tauri window or WebView.
- Native hotkey registry for views.
- Multi-select, preview panels, item buttons, collections, saved-search sharing/import or AI search views.
- Per-view Enter/Paste overrides.

## Data

```ts
type SavedHistoryView = {
  id: number;
  title: string;
  query: string;
  openMode: "browse";
  hotkey: string | null;
  pinned: boolean;
  sortOrder: number | null;
  createdAtUnixMs: number;
  updatedAtUnixMs: number;
};
```

## Acceptance Criteria

- A user can save `Work clips` with `tag:work kind:text`.
- A malformed query such as `tag:work kind:` is rejected and no row is created.
- Opening `Work clips` applies its scope, focuses refinement, and Enter copies/hides with default settings.
- With Enter action set to Paste, Enter pastes/hides and Shift+Enter copies/hides.
- Editing the query after open follows normal picker search behavior.
- An assigned hotkey opens the saved view through Copicu's existing global-shortcut registry.
- The Command Palette lists persisted saved views and opens them through the same normal picker query path.
- Build, focused Rust/storage tests, visual picker tests and script capability checks pass.

## Rollback

The migration is additive. Removing UI and commands leaves saved rows inert; no destructive database downgrade is required.
