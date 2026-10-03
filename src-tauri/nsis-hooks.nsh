; Tauri's default check terminates every process with the same executable name.
; Keep dev/synthetic copies alive: only the executable inside $INSTDIR is ours.
; utils.nsh is included before installerHooks, so both install and uninstall use
; this replacement. Native API arguments are values, never shell source.
!macroundef CheckIfAppIsRunning
!macro CheckIfAppIsRunning executableName productName
  !define COPICU_PROCESS_CHECK_ID ${__LINE__}
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  Push $7
  Push $8
  Push $9
  Push $R1
  Push $R2

  StrCpy $R0 0
  StrCpy $R1 0
  ; A fresh install has no executable to close. GetFullPathName may return an
  ; empty string for a nonexistent/inaccessible path; never compare empties.
  IfFileExists "$INSTDIR\${executableName}" 0 copicu_process_restore_${COPICU_PROCESS_CHECK_ID}
  GetFullPathName $0 "$INSTDIR\${executableName}"
  StrCmp $0 "" copicu_process_snapshot_failed_${COPICU_PROCESS_CHECK_ID}
  nsis_tauri_utils::StrReplace "$(appRunningOkKill)" "{{product_name}}" "${productName}"
  Pop $R2
  System::Call 'kernel32::CreateToolhelp32Snapshot(i 2, i 0) p.r1'
  StrCmp $1 -1 copicu_process_snapshot_failed_${COPICU_PROCESS_CHECK_ID}

  ; PROCESSENTRY32W is 556 bytes in the x86 Unicode NSIS installer, including
  ; its 260 WCHAR name. The installed application may independently be x64.
  System::Alloc 556
  Pop $2
  StrCmp $2 0 copicu_process_alloc_failed_${COPICU_PROCESS_CHECK_ID}
  System::Call '*$2(i 556)'
  System::Call 'kernel32::Process32FirstW(p r1, p r2) i.r3 ?e'
  Pop $6

  copicu_process_loop_${COPICU_PROCESS_CHECK_ID}:
    StrCmp $3 0 copicu_process_enum_done_${COPICU_PROCESS_CHECK_ID}
    System::Call '*$2(i, i, i .r4)'
    ; QUERY_LIMITED_INFORMATION | SYNCHRONIZE | TERMINATE. Retain this handle
    ; across the path check and termination so PID reuse cannot change target.
    System::Call 'kernel32::OpenProcess(i 0x101001, i 0, i r4) p.r5'
    StrCmp $5 0 copicu_process_next_${COPICU_PROCESS_CHECK_ID}
    System::Call 'kernel32::QueryFullProcessImageNameW(p r5, i 0, w .r7, *i ${NSIS_MAX_STRLEN} r8) i.r6'
    StrCmp $6 0 copicu_process_close_${COPICU_PROCESS_CHECK_ID}
    StrCmp $7 "" copicu_process_close_${COPICU_PROCESS_CHECK_ID}
    GetFullPathName $7 "$7"
    StrCmp $7 "" copicu_process_close_${COPICU_PROCESS_CHECK_ID}
    ; StrCmp is case insensitive, matching Windows path comparison.
    StrCmp $7 $0 0 copicu_process_close_${COPICU_PROCESS_CHECK_ID}

    StrCmp $R1 1 copicu_process_kill_${COPICU_PROCESS_CHECK_ID}
    IfSilent copicu_process_kill_${COPICU_PROCESS_CHECK_ID}
    ${If} $PassiveMode != 1
      MessageBox MB_OKCANCEL $R2 IDOK copicu_process_kill_${COPICU_PROCESS_CHECK_ID}
      StrCpy $R0 1
      System::Call 'kernel32::CloseHandle(p r5)'
      Goto copicu_process_done_${COPICU_PROCESS_CHECK_ID}
    ${EndIf}
    copicu_process_kill_${COPICU_PROCESS_CHECK_ID}:
      StrCpy $R1 1
      System::Call 'kernel32::TerminateProcess(p r5, i 0) i.r9'
      ; Already-exited processes also return WAIT_OBJECT_0. Do not continue
      ; replacing files until a selected process has actually exited.
      System::Call 'kernel32::WaitForSingleObject(p r5, i 10000) i.r9'
      StrCmp $9 0 copicu_process_close_${COPICU_PROCESS_CHECK_ID}
      StrCpy $R0 1
    copicu_process_close_${COPICU_PROCESS_CHECK_ID}:
      System::Call 'kernel32::CloseHandle(p r5)'
    copicu_process_next_${COPICU_PROCESS_CHECK_ID}:
      System::Call 'kernel32::Process32NextW(p r1, p r2) i.r3 ?e'
      Pop $6
      Goto copicu_process_loop_${COPICU_PROCESS_CHECK_ID}

  copicu_process_enum_done_${COPICU_PROCESS_CHECK_ID}:
    StrCmp $6 18 copicu_process_done_${COPICU_PROCESS_CHECK_ID}
    StrCpy $R0 1
  copicu_process_done_${COPICU_PROCESS_CHECK_ID}:
    System::Free $2
    Goto copicu_process_close_snapshot_${COPICU_PROCESS_CHECK_ID}
  copicu_process_alloc_failed_${COPICU_PROCESS_CHECK_ID}:
    StrCpy $R0 1
  copicu_process_close_snapshot_${COPICU_PROCESS_CHECK_ID}:
    System::Call 'kernel32::CloseHandle(p r1)'
    Goto copicu_process_restore_${COPICU_PROCESS_CHECK_ID}
  copicu_process_snapshot_failed_${COPICU_PROCESS_CHECK_ID}:
    StrCpy $R0 1
  copicu_process_restore_${COPICU_PROCESS_CHECK_ID}:
    Pop $R2
    Pop $R1
    Pop $9
    Pop $8
    Pop $7
    Pop $6
    Pop $5
    Pop $4
    Pop $3
    Pop $2
    Pop $1
    Pop $0
    StrCmp $R0 0 copicu_process_checked_${COPICU_PROCESS_CHECK_ID}
    nsis_tauri_utils::StrReplace "$(failedToKillApp)" "{{product_name}}" "${productName}"
    Pop $R0
    Abort $R0
  copicu_process_checked_${COPICU_PROCESS_CHECK_ID}:
    !undef COPICU_PROCESS_CHECK_ID
!macroend

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
