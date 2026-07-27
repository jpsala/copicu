!macro NSIS_HOOK_POSTINSTALL
  IfFileExists "$INSTDIR\resources\WebView2Loader.dll" 0 +2
    CopyFiles /SILENT "$INSTDIR\resources\WebView2Loader.dll" "$INSTDIR\WebView2Loader.dll"
  Delete "$INSTDIR\bench_history_search.exe"

  CreateDirectory "$DOCUMENTS\Copicu\Scripts"
  IfFileExists "$DOCUMENTS\Copicu\Scripts\030-extract-urls-copy.ts" bundled_script_030_done
    CopyFiles /SILENT "$INSTDIR\bundled-scripts\030-extract-urls-copy.ts" "$DOCUMENTS\Copicu\Scripts\030-extract-urls-copy.ts"
  bundled_script_030_done:
  IfFileExists "$DOCUMENTS\Copicu\Scripts\031-join-selected-markdown-copy.ts" bundled_script_031_done
    CopyFiles /SILENT "$INSTDIR\bundled-scripts\031-join-selected-markdown-copy.ts" "$DOCUMENTS\Copicu\Scripts\031-join-selected-markdown-copy.ts"
  bundled_script_031_done:
  IfFileExists "$DOCUMENTS\Copicu\Scripts\copicu-action.d.ts" bundled_script_types_done
    CopyFiles /SILENT "$INSTDIR\bundled-scripts\copicu-action.d.ts" "$DOCUMENTS\Copicu\Scripts\copicu-action.d.ts"
  bundled_script_types_done:
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$INSTDIR\WebView2Loader.dll"
  Delete "$INSTDIR\bench_history_search.exe"
!macroend
