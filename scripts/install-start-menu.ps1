# Crée le raccourci Windows "InkFlow" dans le Menu Démarrer de l'utilisateur courant
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$exeCandidates = @(
    (Join-Path $projectRoot 'InkFlow.exe'),
    (Join-Path $projectRoot 'src-tauri\target\release\InkFlow.exe')
)
$exePath = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $exePath) {
    throw "InkFlow.exe introuvable. Lancez d'abord 'npm run tauri:build'."
}

# S'assure que WebView2Loader.dll est présent à côté de InkFlow.exe (requis pour le build MinGW/GNU)
$exeDir = Split-Path -Parent $exePath
$targetDll = Join-Path $exeDir 'WebView2Loader.dll'
$releaseDll = Join-Path $projectRoot 'src-tauri\target\release\WebView2Loader.dll'
if (-not (Test-Path $targetDll) -and (Test-Path $releaseDll)) {
    Copy-Item -Path $releaseDll -Destination $targetDll -Force
}

$iconPath = Join-Path $projectRoot 'src-tauri\icons\icon.ico'
$startMenuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$shortcutPath = Join-Path $startMenuDir 'InkFlow.lnk'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $exePath
$shortcut.WorkingDirectory = Split-Path -Parent $exePath
$shortcut.Description = 'InkFlow — Notes manuscrites, stylet Windows Ink & annotation PDF'
if (Test-Path $iconPath) {
    $shortcut.IconLocation = "$iconPath,0"
} else {
    $shortcut.IconLocation = "$exePath,0"
}
$shortcut.Save()

Write-Host "✅ Raccourci Menu Démarrer créé : $shortcutPath"
Write-Host "   Cible : $exePath"
Write-Host "   Icône : $($shortcut.IconLocation)"
