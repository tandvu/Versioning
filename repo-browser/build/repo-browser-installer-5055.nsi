!define PRODUCT_NAME "Repo Browser"
!define OUTFILE "C:\\tan_projects\\repo-browser\\build\\repo-browser-installer-5055.exe"

Name "${PRODUCT_NAME}"
OutFile "${OUTFILE}"
InstallDir "$PROGRAMFILES\\Repo Browser"

Page directory
Page instfiles

Section "Install"
  SetOutPath "$INSTDIR"
  ; Include the entire standalone folder contents
  File /r "C:\\tan_projects\\repo-browser\\standalone\\*"

  ; Create Start Menu shortcut to StartApp.bat
  CreateDirectory "$SMPROGRAMS\\Repo Browser"
  CreateShortCut "$SMPROGRAMS\\Repo Browser\\Start Repo Browser.lnk" "$INSTDIR\\StartApp.bat"
SectionEnd
