; Installer hooks (Tauri's NSIS template). Regards' daemon keeps running when
; the window closes (background mode), and Windows does not let the files of
; a running program be replaced or removed: it is stopped first.
;
; The order matters. These hooks run before the installer's own check for a
; running app, and an app left open starts the daemon again as soon as it is
; gone. So the app is closed first, then the daemon is stopped.
;
; `regards.exe` can still be held after that, by an agent's `regards mcp` for
; one. A silent install would then skip that one file without a word and
; leave a new app beside an old daemon, so nothing is installed until the
; file is free. Those programs are not closed from here: closing a console
; program through Windows' Restart Manager also ends the terminal it runs in.

!include LogicLib.nsh

!define REGARDS_IN_USE "${PRODUCTNAME} is still in use by another program, so its files cannot be replaced.$\n$\nClose what is connected to it (an AI agent, a terminal running regards), then try again."

Var RegardsStopExit
Var RegardsTry
Var RegardsFile
Var RegardsFree

!macro REGARDS_STOP_DAEMON
  ${If} ${FileExists} "$INSTDIR\regards.exe"
    ; Asks before closing the app, unless the install is silent or an update.
    !insertmacro CheckIfAppIsRunning "$INSTDIR\${MAINBINARYNAME}.exe" "${PRODUCTNAME}"
    ${Do}
      ; Returns once the daemon has let go of its data.
      nsExec::Exec '"$INSTDIR\regards.exe" daemon stop'
      Pop $RegardsStopExit
      ; The process exits right after it let go: its file is free within moments.
      StrCpy $RegardsFree 0
      ${For} $RegardsTry 1 10
        ClearErrors
        FileOpen $RegardsFile "$INSTDIR\regards.exe" a
        ${IfNot} ${Errors}
          FileClose $RegardsFile
          StrCpy $RegardsFree 1
          ${ExitFor}
        ${EndIf}
        Sleep 300
      ${Next}
      ${If} $RegardsFree = 1
        ${ExitDo}
      ${EndIf}
      ; A silent install takes the default, and stops here.
      ${If} ${Cmd} `MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "${REGARDS_IN_USE}" /SD IDCANCEL IDCANCEL`
        Abort "${REGARDS_IN_USE}"
      ${EndIf}
    ${Loop}
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
