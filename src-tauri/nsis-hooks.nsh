!macro NSIS_HOOK_POSTINSTALL
  IfFileExists "$INSTDIR\resources\WebView2Loader.dll" 0 +2
    CopyFiles /SILENT "$INSTDIR\resources\WebView2Loader.dll" "$INSTDIR\WebView2Loader.dll"
  Delete "$INSTDIR\bench_history_search.exe"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$INSTDIR\WebView2Loader.dll"
  Delete "$INSTDIR\bench_history_search.exe"
!macroend
