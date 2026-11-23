; ALTTER installer hooks (electron-builder NSIS).
; ALTTER keeps your data next to the app: <install dir>\data and <install dir>\projects.
; Uninstalling or updating removes the program files only — never those two folders.

!macro customRemoveFiles
  FindFirst $R0 $R1 "$INSTDIR\*.*"
  alter_rm_loop:
    StrCmp $R1 "" alter_rm_done
    StrCmp $R1 "." alter_rm_next
    StrCmp $R1 ".." alter_rm_next
    StrCmp $R1 "data" alter_rm_next
    StrCmp $R1 "projects" alter_rm_next
    IfFileExists "$INSTDIR\$R1\*.*" alter_rm_dir
      Delete "$INSTDIR\$R1"
      Goto alter_rm_next
    alter_rm_dir:
      RMDir /r "$INSTDIR\$R1"
  alter_rm_next:
    FindNext $R0 $R1
    Goto alter_rm_loop
  alter_rm_done:
  FindClose $R0
  ; removes the folder only when it is empty (i.e. no data was ever created)
  RMDir "$INSTDIR"
!macroend

; renamed Alter -> ALTTER: old shortcuts with the same app id would show a blank taskbar icon
!macro customInstall
  Delete "$PROFILE\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Alter.lnk"
  Delete "$PROFILE\Desktop\Alter.lnk"
  ReadEnvStr $0 ProgramData
  Delete "$0\Microsoft\Windows\Start Menu\Programs\Alter.lnk"
  ReadEnvStr $0 PUBLIC
  Delete "$0\Desktop\Alter.lnk"
!macroend
