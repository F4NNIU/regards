; Installer hooks (Tauri's NSIS template). Regards' daemon keeps running when
; the window closes (background mode), and Windows does not let the files of
; a running program be replaced or removed: it is stopped first.
; `regards daemon stop` returns once the daemon has let go of its data.

!include LogicLib.nsh

Var RegardsStopExit

!macro REGARDS_STOP_DAEMON
  ${If} ${FileExists} "$INSTDIR\regards.exe"
    nsExec::Exec '"$INSTDIR\regards.exe" daemon stop'
    Pop $RegardsStopExit
    ; The process exits right after it let go.
    Sleep 500
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro REGARDS_STOP_DAEMON
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro REGARDS_STOP_DAEMON
  ; Taken off the user's Path when Regards goes, not when it is updated.
  ${If} $UpdateMode <> 1
  ${AndIf} ${FileExists} "$INSTDIR\regards.exe"
    nsExec::Exec '"$INSTDIR\regards.exe" path remove'
    Pop $RegardsStopExit
  ${EndIf}
!macroend

; Up to 0.3.0 the installer had no publisher name, and kept its notes (where
; Regards is installed, the installer's language) under the key below. They
; are now under the publisher's name: the old ones go.
!macro NSIS_HOOK_POSTINSTALL
  DeleteRegKey HKCU "Software\regards\Regards"
  DeleteRegKey /ifempty HKCU "Software\regards"
!macroend
