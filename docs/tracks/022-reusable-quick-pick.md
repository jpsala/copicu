---
id: 022-reusable-quick-pick
status: proposed
updated: 2026-07-12
---

# 022 Reusable Quick Pick

## Goal

Add a VS Code-style Quick Pick that lets Copicu internals and approved scripts ask the user to choose one clipboard item from a constrained history query.

This is the reusable interaction behind `Win+E` (`#e`) in `C:\dev\main`: focusable input, filtered list, arrow navigation, Enter/click to accept, Escape/outside close to cancel, and a serializable result. `Win+A/W/C` remain which-key menus. Copicu already has the UI mechanics in its action `CommandPalette`; it does **not** yet expose a script-awaitable item-selection request.

## Evidence

- `C:\dev\main\command-palette.ahk`, `command-palette-catalog.ahk` and `ui/command-palette.html` implement `Win+E` (`#e`): a prewarmed reusable WebView, catalog DTOs, fuzzy/frecency ordering, drill-down and a stable ID-to-closure dispatch map.
- `src/main.tsx` has `CommandPalette` and `ActionPicker`, but both filter `ActionDefinition` objects and run actions.
- Copicu's picker and `history_search` already provide paginated, structured history filtering. Scripts can call `history.search()` and request `picker:filter`, but cannot await a user selection.
- `ui-host` is intentionally a short prompt surface. It should not become a paginated history selector.

## Reference behavior to preserve

`#e` is the right reference because it cleanly separates the UI from execution:

- it prewarms and reuses one palette surface;
- it sends serializable catalog rows (`id`, kind, label, source, breadcrumb, shortcut and detail) into the UI;
- the UI returns only an ID or cancellation, while the host keeps closures/actions private;
- it restores the previously focused window, resets its query on each open, cancels on Escape/click outside and handles group drill-down;
- fuzzy score is primary, while frecency only orders ties or the empty query.

For Copicu, history rows replace command rows and Rust replaces the AHK closure map. The boundary remains the same: UI selects an opaque ID; the host validates and performs the domain action.

## Recommendation

Build a private `QuickPickCore` first, then expose one narrow history API after it preserves the two existing action palettes unchanged. Generalize the public API only after a second real caller:

```ts
const result = await copicu.history.pick({
  title: "Choose a clip",
  baseFilter: "tag:work kind:text",
});

// { status: "selected", itemId: 42 }
// | { status: "cancelled" | "busy" | "timedOut" | "invalidated" }
```

`history.pick` is a Quick Pick, not a clipboard mutation. It returns an ID only. A script must already have the appropriate read capability to fetch content afterwards.

Do not start with generic static options, multi-select, custom callbacks, rich HTML or a new WebView surface. Those are plausible follow-ups, not MVP requirements.

## Contract

### Request

```ts
type HistoryPickRequest = {
  title?: string;
  placeholder?: string;
  baseFilter: string;
};
```

- `baseFilter` uses Copicu's existing query syntax and is parsed by Rust before the UI opens.
- It is an enforced scope, not editable UI text.
- The user can type a refinement. The backend combines the validated base filter with that refinement for every page request.
- MVP is single select only.

### Response

```ts
type HistoryPickResult =
  | { status: "selected"; itemId: number }
  | { status: "cancelled" }
  | { status: "busy" }
  | { status: "timedOut" }
  | { status: "invalidated" };
```

No item content crosses back to the script runner as part of the selection response. The selected ID is revalidated against the effective filter before resolving.

## Product model

Copicu should treat this as a **Chooser/Quick Pick platform**, not a command-palette clone. The same shell can render a filtered history view, actions, tags or saved views, but four concerns stay independent:

1. **Invocation preset**: title, provider, initial query/scope and behavior. A saved history view is one preset.
2. **Provider**: history, actions, tags, saved views, then collections/formats when they exist.
3. **Presentation**: query/refinement, pages, active row, loading and optional trusted preview.
4. **Acceptance behavior**: browse/activate a clip, return IDs to a caller, or open a destination.

### Browse versus pick

| Mode | Caller | Enter | Escape | Result |
| --- | --- | --- | --- | --- |
| `browse` | user hotkey or saved view | Copy selected clip and hide | Existing clear-then-hide behavior | No awaited result |
| `pick` | script/internal workflow | Resolves selected ID, no clipboard mutation | Cancels immediately | ID/status only |

This distinction is mandatory. A saved filter hotkey must not accidentally behave like a script picker, and a script picker must never copy or paste merely because the normal picker does.

### Saved history views

Saved searches are independent data, not a property of `QuickPickCore`:

```ts
type SavedHistoryView = {
  id: number;
  title: string;
  query: string;
  hotkey: string | null;
  openMode: "browse";
  pinned: boolean;
  sortOrder: number | null;
};
```

The query is validated through the existing structured history search before save. Its hotkey joins Copicu's existing native global-shortcut registry as a `SavedViewOpen` route, rather than creating a registry inside the chooser. That preserves one conflict/registration path and opens normal picker browse with the query editable. Future `history.pick()` will own immutable scope semantics. **Decision 2026-07-12:** Enter copies the selected clip and hides the chooser.

An unfiltered invocation is explicit:

```ts
type HistoryPickScope =
  | { kind: "all" }
  | { kind: "filter"; query: string };
```

`{ kind: "all" }` is valid for a user browse shortcut, but scripts must opt in deliberately rather than omitting a filter by accident.

### Private protocol and public wrappers

The renderer/host protocol may use a discriminated request internally, but scripts get domain wrappers only:

```ts
// Public after a dogfood caller proves it
copicu.history.pick({ scope, title, placeholder });

// Product action, not an awaitable script callback
openSavedHistoryView(viewId);
```

Internally the provider request can distinguish `history`, `actions`, `tags`, `savedViews` and eventually bounded `static` options. Providers are registered by the host and validate their own parameters. Scripts never name arbitrary providers, send callbacks/HTML/SQL or choose acceptance behavior such as paste; copy/paste remain explicit separately capability-gated actions.

## Ownership and lifecycle

```text
script/internal caller
  -> Rust: validate capability + parse base filter + create session
  -> main window: open Quick Pick mode(sessionId, title)
  -> main renderer: request pages(sessionId, refinement, cursor)
  -> Rust/storage: history_search(baseFilter + refinement)
  -> main renderer: select itemId or cancel
  -> Rust: resolve exactly once, revalidate item, release caller
  -> script/internal caller: typed result
```

- Rust owns opaque session IDs and terminal resolution.
- Permit one active Quick Pick process-wide. A concurrent request returns `busy`; do not queue user-contextual prompts.
- Escape, click-outside, hide, close, focus-loss, caller exit, renderer reload, application shutdown and deadline expiry all cancel exactly once.
- Start with a dedicated mode in the already-warm `main` picker window only if a focused lifecycle probe proves it can isolate and restore normal search/selection. Otherwise prefer a cached dedicated surface: it costs memory, but existing metadata measurements show that an extra cached WebView should be a deliberate tradeoff, not an assumption. Never reuse `ui-host`.
- Use existing cursor pagination. Do not snapshot an arbitrary top N of history in MVP: it makes empty filters incomplete and adds a second storage path. Revalidate the selected ID instead.

## Capability boundary

| Operation | Capability | Returned data |
| --- | --- | --- |
| Open/select history Quick Pick | `history:pick` | Selected ID and terminal status |
| Read candidate previews | host-owned through the session | Trusted display DTO only |
| Read selected content | existing `history:read-content` | Content only when separately authorized |
| Generic static Quick Pick, future | `ui:quick-pick` | Caller-supplied opaque ID only |

The host checks authorization before creating a session or showing a window. Scripts never supply executable callbacks, raw SQL, HTML or window labels.

## Reuse plan

Extract a private `QuickPickCore<T>` from `CommandPalette` and `ActionPicker` with only:

- input autofocus and `aria-activedescendant`;
- active-index reset/clamping;
- ArrowUp/ArrowDown, Enter, Escape and click;
- listbox semantics, empty/loading state and compact visual shell.

Adapters remain domain-owned:

| Adapter/provider | Data | Filtering | Result |
| --- | --- | --- | --- |
| Command Palette | action registry | local | dispatch action |
| Quick Actions | eligible contextual actions | local | dispatch action |
| History Quick Pick | host-paged history DTOs | host-side | item ID/status |
| Future static Quick Pick | bounded caller DTOs | local | opaque caller ID |

Core never locally filters a paginated history source. Its history provider owns debounce, cursor, loading/error state, page dedupe and session/query generations. Rust owns session IDs, base-filter composition and completion, so scripts cannot bypass history or focus rules.

## Opportunity matrix

| Rank | Use | Value | Provider | Status |
| --- | --- | --- | --- | --- |
| 1 | Quick Actions | high | action registry | already implemented |
| 2 | Hotkey-triggered saved history view | high | `history` in `browse` mode | first product slice |
| 3 | Choose a scoped clip from a script/internal flow | high | `history.pick(scope)` | second slice |
| 4 | Unfiltered history chooser | medium | `history` with explicit `all` scope | same provider, after browse semantics pass |
| 5 | Choose a contextual clip for append, compare or deterministic triage | medium | `history.pick(scope)` | next caller |
| 6 | Choose a tag, saved view, source app or format facet | medium later | bounded provider | add only with its feature |
| 7 | Review enrichment or choose collection target | low now | future provider | defer |
| 8 | Generic caller-provided option list | unproven | static items | defer |

## MVP slices

1. **Core extraction**: migrate Command Palette and Quick Actions to `QuickPickCore` without behavior change, including their adapters and interaction tests.
2. **Saved-view browse slice**: persist validated history views with optional hotkeys in the existing native registry. Opening a view runs the history provider in `browse` mode, focuses refinement; Enter copies the selected clip and hides the chooser.
3. **Pick protocol**: add `history:pick`, typed scope/result, Rust exclusive-session state, deadline and capability drift coverage.
4. **History pick provider**: session-bound mode/surface, host-side refinement over existing `history_search`, cursor pagination, display DTOs and IDs-only completion.
5. **Dogfood caller**: one approved script or internal flow uses `history.pick`; validate focus return, selection/cancel and zero clipboard mutation.
6. **Reassess**: only after two real callers, evaluate public `ui.quickPick({ items })`; multi-select, previews, item buttons and a dedicated surface all require evidence.

## First dogfood workflow

First prove `browse` with a saved `Work clips` view and its configured hotkey: Enter copies the selected clip and hides the chooser. Then a deterministic triage script opens `history.pick({ scope: { kind: "filter", query: "tag:work kind:text" } })`, lets the user refine and choose, then receives only `itemId`. The script must separately hold `history:read-content` before inspecting content. Cancel, timeout, busy or invalidation mutate nothing.

## Validation

- `npm run build`
- `npm run rust:test`
- `npm run capabilities:drift:test`
- frontend tests: autofocus, keyboard navigation, click, filter refinement, Escape/click-outside cancellation, no overflow, state restoration;
- Rust tests: denied capability, exact-once resolution, `busy`, stale session/event rejection, timeout, item deletion and post-filter revalidation;
- script tests: result contains only an ID/status, not item content;
- manual oracle: external app -> script opens picker -> select/cancel -> focus returns correctly, with no copy/paste or clipboard mutation.

## Rejected for MVP

- Reusing `ui-host` for a rich paginated list.
- Running a script callback from the selected option.
- Letting a script-provided refinement remove the base filter.
- A static generic options API before a second non-history caller.
- A separate Tauri/WebView surface per request.

## Open questions

1. Can a `main` picker mode meet isolation/restoration rules under normal refresh/pagination, or do a focused probe and metadata's measured WebView cost justify a cached dedicated surface?
2. What deadline feels correct for an interactive script request without making the action runner appear stuck?
3. Should Copicu's first history Quick Pick keep the flat list behavior of `#e`, or introduce drill-down only when a real hierarchical provider exists?
