# Test that android/keystore.properties can open mobile/obostores-release.keystore
# Usage (from repo root):
#   $env:JAVA_HOME = "F:\Program Files\Android\Android Studio\jbr"
#   .\android\scripts\verify-keystore.ps1

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$propsFile = Join-Path $repoRoot 'android\keystore.properties'
$keytool = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin\keytool.exe' } else { 'keytool' }

if (-not (Test-Path $propsFile)) {
    Write-Error "Missing $propsFile. Copy keystore.properties.example and set passwords."
}
if (-not (Test-Path $keytool)) {
    Write-Error "keytool not found. Set JAVA_HOME to Android Studio jbr."
}

$props = @{}
Get-Content $propsFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $k, $v = $_ -split '=', 2
    $props[$k.Trim()] = $v.Trim()
}

$storePath = [System.IO.Path]::GetFullPath((Join-Path (Join-Path $repoRoot 'android') $props['storeFile']))

Write-Host "Keystore: $storePath"
Write-Host "Alias:    $($props['keyAlias'])"
Write-Host ''

& $keytool -list -v -keystore $storePath -storepass $props['storePassword'] 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'FAIL: storePassword is wrong for this .keystore file.' -ForegroundColor Red
    Write-Host 'Run: .\android\scripts\create-release-keystore.ps1 to create a new keystore with a known password.'
    exit 1
}

Write-Host 'OK: store password works.' -ForegroundColor Green

& $keytool -list -v -keystore $storePath -storepass $props['storePassword'] -alias $props['keyAlias'] 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL: keyAlias '$($props['keyAlias'])' not found. Aliases in keystore:" -ForegroundColor Yellow
    & $keytool -list -keystore $storePath -storepass $props['storePassword']
    exit 1
}

Write-Host 'OK: alias exists. Next: cd mobile; npm run android:bundleRelease' -ForegroundColor Green
