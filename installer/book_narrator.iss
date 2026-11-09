; Inno Setup script: packs the PyInstaller folder build into ONE Setup .exe.
;
; Why an installer instead of a single portable .exe?
;   A PyInstaller "onefile" exe unpacks ~480 MB (app + Kokoro voice model) to a
;   temp folder on EVERY launch, which takes ~5-20 s. Installing once lets the
;   app start in ~2 s afterwards.
;
; - Installs per-user (no admin / UAC prompt) into %LOCALAPPDATA%\Programs\BookNarrator
; - Start-menu + optional desktop shortcut, "Launch now" checkbox at the end
; - User projects live in %LOCALAPPDATA%\BookNarrator and survive updates/uninstall
;
; Build (after `pyinstaller book_narrator.spec` produced dist\<AppExeName>\):
;   iscc /DAppVersion=1.0.0 /DAppExeName=book-narrator installer\book_narrator.iss

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef AppExeName
  #define AppExeName "book-narrator"
#endif
#ifndef SourceDir
  #define SourceDir "..\dist\" + AppExeName
#endif
#ifndef OutputDir
  #define OutputDir "..\dist\installer"
#endif

#define AppName "AI Book Narrator Studio"

[Setup]
AppId={{6C1D2E7A-4B8F-4C55-9F3A-2B7E8D1A9C40}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
DefaultDirName={autopf}\BookNarrator
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
DisableDirPage=auto
DisableReadyPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename=BookNarrator-Setup-{#AppVersion}
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\{#AppExeName}.exe
; The voice model barely compresses; fast LZMA keeps install time short.
Compression=lzma2/fast
SolidCompression=no
WizardStyle=modern
CloseApplications=yes

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[UninstallDelete]
; In-app engine updates add files the installer did not list; remove them too.
Type: filesandordirs; Name: "{app}\_internal"

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExeName}.exe"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}.exe"; Tasks: desktopicon

[Run]
; Interactive install: "Launch now" checkbox on the last wizard page.
Filename: "{app}\{#AppExeName}.exe"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent
; Silent install (the in-app updater runs /VERYSILENT): reopen the app, since no wizard page is shown.
Filename: "{app}\{#AppExeName}.exe"; Flags: nowait; Check: WizardSilent
