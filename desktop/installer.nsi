; Reconstructed after source cleanup; this is new installer source, not a recovered original.
Unicode true
RequestExecutionLevel user
!include "MUI2.nsh"
!include "LogicLib.nsh"
Name "九境 · Nine Realms"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\Nine Realms"
InstallDirRegKey HKCU "Software\NineRealms" "InstallDir"
VIProductVersion "${VERSION_QUAD}"
VIAddVersionKey /LANG=2052 "ProductName" "九境 · Nine Realms"
VIAddVersionKey /LANG=2052 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=2052 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=2052 "FileDescription" "九境离线数独安装程序"
VIAddVersionKey /LANG=2052 "LegalCopyright" "Nine Realms"
!ifdef NO_COMPRESSION
SetCompress off
!else
SetCompressor /SOLID lzma
!endif
ShowInstDetails show
ShowUninstDetails show
!define MUI_ICON "${ICON_FILE}"
!define MUI_UNICON "${ICON_FILE}"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH
!insertmacro MUI_LANGUAGE "SimpChinese"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\NineRealms"

Function .onInit
  SetShellVarContext current
FunctionEnd

; Only accept an empty directory, a marked install, or the prior app installation.
Function .onVerifyInstDir
  StrCmp $INSTDIR "" invalid_dir
  GetFullPathName $0 "$INSTDIR\.."
  StrCmp $0 $INSTDIR invalid_dir
  StrCmp $INSTDIR "$WINDIR" invalid_dir
  StrCmp $INSTDIR "$PROFILE" invalid_dir
  StrCmp $INSTDIR "$LOCALAPPDATA" invalid_dir
  ReadINIStr $0 "$INSTDIR\.nine-realms-install" "Application" "ID"
  StrCmp $0 "nine-realms-sudoku" valid_dir
  IfFileExists "$INSTDIR\Nine Realms.exe" 0 check_empty
  IfFileExists "$INSTDIR\resources\app\main.cjs" 0 check_empty
  IfFileExists "$INSTDIR\Uninstall.exe" valid_dir check_empty
check_empty:
  FindFirst $0 $1 "$INSTDIR\*"
empty_loop:
  StrCmp $1 "" empty_done
  StrCmp $1 "." next_item
  StrCmp $1 ".." next_item
  FindClose $0
  Goto invalid_dir
next_item:
  FindNext $0 $1
  Goto empty_loop
empty_done:
  FindClose $0
valid_dir:
  ClearErrors
  Return
invalid_dir:
  Abort
FunctionEnd

Section "九境" Main
  SetShellVarContext current
  SetOverwrite on
  !include "${PAYLOAD_INSTALL}"
  SetOutPath "$INSTDIR"
  WriteINIStr "$INSTDIR\.nine-realms-install" "Application" "ID" "nine-realms-sudoku"
  WriteINIStr "$INSTDIR\.nine-realms-install" "Application" "Version" "${VERSION}"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  IfErrors install_failed
  CreateDirectory "$SMPROGRAMS\Nine Realms"
  CreateShortCut "$SMPROGRAMS\Nine Realms\Nine Realms.lnk" "$INSTDIR\Nine Realms.exe" "" "$INSTDIR\NineRealms.ico"
  CreateShortCut "$DESKTOP\Nine Realms.lnk" "$INSTDIR\Nine Realms.exe" "" "$INSTDIR\NineRealms.ico"
  WriteRegStr HKCU "Software\NineRealms" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "九境 · Nine Realms"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "Nine Realms"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\NineRealms.ico"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "EstimatedSize" ${INSTALL_SIZE_KB}
  IfErrors install_failed
  Goto install_done
install_failed:
  MessageBox MB_ICONSTOP "安装未完成。请关闭正在运行的九境后重试。"
  Abort
install_done:
SectionEnd

Function un.onInit
  SetShellVarContext current
  ReadINIStr $0 "$INSTDIR\.nine-realms-install" "Application" "ID"
  StrCmp $0 "nine-realms-sudoku" uninstall_allowed
  MessageBox MB_ICONSTOP "未找到九境安装标记，已停止卸载。"
  Abort
uninstall_allowed:
FunctionEnd

Section "Uninstall"
  SetShellVarContext current
  ClearErrors
  !include "${PAYLOAD_UNINSTALL}"
  IfErrors un_files_failed
  Delete "$DESKTOP\Nine Realms.lnk"
  Delete "$SMPROGRAMS\Nine Realms\Nine Realms.lnk"
  RMDir "$SMPROGRAMS\Nine Realms"
  ReadRegStr $0 HKCU "${UNINSTALL_KEY}" "InstallLocation"
  StrCmp $0 $INSTDIR 0 +2
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  ReadRegStr $0 HKCU "Software\NineRealms" "InstallDir"
  StrCmp $0 $INSTDIR 0 +2
  DeleteRegKey HKCU "Software\NineRealms"
  Delete "$INSTDIR\.nine-realms-install"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Goto un_done
un_files_failed:
  MessageBox MB_ICONEXCLAMATION "部分文件仍在使用，请关闭九境后重试卸载。用户存档保留。"
  Abort
un_done:
SectionEnd
