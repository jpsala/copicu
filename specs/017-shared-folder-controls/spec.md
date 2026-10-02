# Shared folder controls

Status: implemented and validated locally; distribution of this cut is tracked
separately. Evidence and next step: [track 042](../../docs/tracks/042-shared-folder-controls.md).

## Scope

JP approved a functional prototype after reviewing search, browsing and path creation references. The shared folder selector serves metadata and folder destination dialogs; the picker reuses its folder tree renderer. Preserve the current product styling and keyboard flow. The original implementation authorization did not include new dependencies, release or installation; current effects require current authorization.

## Interaction

- The selector displays the current path (or mixed selection) and opens a compact file-manager tree, sharing its row renderer with picker navigation. Opening reveals the selected destination and its ancestors.
- Rows show folder names, disclosure arrows and indentation. Filtering retains matching folders and their ancestors, expands relevant branches and highlights matching names. Clearing the filter restores normal expansion. Root `/` is a destination; All history exists only in picker navigation.
- Clicking a row selects a candidate without closing. Choose folder, Enter or double-click commits that candidate to the caller's draft. Disclosure arrows only expand/collapse.
- New folder inserts a focused editable row under the selected parent. It accepts a name or relative nested path, and Enter/Create and choose stages creation. Existing names offer Choose folder without duplication. Escape cancels the inline draft and restores the filter. No separate creation screen or breadcrumbs are required.
- Up/Down move the active result, Enter chooses, Escape closes and restores focus. Tab completion must preserve normal keyboard access. Panels must fit narrow windows and escape clipping containers.
- Metadata folder changes, including new paths, are staged until Save. Cancel and Undo must not create folders. Saving folder creation and clip metadata is atomic and guarded by the existing snapshot token.
- Existing multi-selection can retain differing folders or choose one destination for all. New clips and embedded editors use the same selector where their save contract supports it.
- Folder move dialogs exclude the moving folder and its descendants. Reuse current folder permissions and validation.

## Acceptance

Synthetic tests cover existing destination, Root, nested path creation, canceled creation, mixed metadata, stale snapshots, duplicate/invalid names, rollback and keyboard focus. Existing picker navigation, moving, resizing and context menu behavior remain intact. Reload/restart the development app after verification for JP's feedback.
