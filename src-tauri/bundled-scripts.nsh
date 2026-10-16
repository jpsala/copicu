; The scripts root is scanned non-recursively. Files in disabled are installed
; but inert. Keep both locations untouched on upgrades (including user edits).
!macro CopicuInstallScript scriptsRoot bundleRoot file defaultSubdir
  IfFileExists "${scriptsRoot}\${file}" bundled_${file}_done
  IfFileExists "${scriptsRoot}\disabled\${file}" bundled_${file}_done
  CopyFiles /SILENT "${bundleRoot}\${file}" "${scriptsRoot}${defaultSubdir}\${file}"
  bundled_${file}_done:
!macroend

!macro CopicuInstallBundledScripts scriptsRoot bundleRoot
  CreateDirectory "${scriptsRoot}"
  CreateDirectory "${scriptsRoot}\disabled"

  ; Technical examples: active, with only their declared triggers.
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "001-toast-hello.ts" ""
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "015-log-text-clipboard-change.ts" ""
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "017-alert-clipboard-text-length.ts" ""
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "018-markdown-output-summary.ts" ""
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "019-compound-hotkey-toast.ts" ""
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "027-toast-path-clipboard-change.ts" ""

  ; Combining clips.
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "003-join-selected-with-log-name.ts" ""
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "012-copy-todo-summary.ts" ""
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "031-join-selected-markdown-copy.ts" ""

  ; Metadata.
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "002-copy-current-title.ts" ""
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "005-triage-clipboard-batch.ts" ""
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "006-tag-selected-and-note.ts" ""
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "025-assign-metadata-to-active.ts" ""
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "026-inspect-enrichment-active.ts" ""

  ; Search.
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "007-search-scripted-text.ts" ""
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "008-filter-long-text.ts" ""
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "020-open-tag-filtered.ts" ""
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "021-open-work-tag-filtered.ts" ""
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "022-open-context-text-filtered.ts" ""
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "023-open-marked-context-filtered.ts" ""
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "024-open-prompt-filtered.ts" ""

  ; Copy/paste and history cycling.
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "009-activate-current-copy.ts" ""
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "013-paste-current-to-previous.ts" ""
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "032-activate-previous-global.ts" ""
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "033-activate-next-global.ts" ""

  ; Sharing: available, but channel grants/subscription/writer gates still apply.
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "034-publish-selected-to-shared-channel.ts" ""
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "035-inspect-shared-reception.ts" ""
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "036-write-transformed-shared-reception.ts" ""

  ; Text/URL tools, including network enrichment: installed, disabled initially.
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "004-url-open-or-filter.ts" "\disabled"
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "010-normalize-whitespace-copy.ts" "\disabled"
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "011-copy-markdown-link.ts" "\disabled"
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "028-clean-url-tracking-copy.ts" "\disabled"
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "029-format-json-copy.ts" "\disabled"
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "030-extract-urls-copy.ts" "\disabled"
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "037-youtube-title-clipboard-change.ts" "\disabled"

  ; Types for active and inactive scripts. Never overwrite user copies.
  !insertmacro CopicuInstallScript "${scriptsRoot}" "${bundleRoot}" "copicu-action.d.ts" ""
  IfFileExists "${scriptsRoot}\disabled\copicu-action.d.ts" bundled_disabled_types_done
    CopyFiles /SILENT "${bundleRoot}\copicu-action.d.ts" "${scriptsRoot}\disabled\copicu-action.d.ts"
  bundled_disabled_types_done:
!macroend
