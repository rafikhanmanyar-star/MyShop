# One-step Play Store AAB build: JAVA_HOME, version bump, keystore verify, cap sync, Gradle bundleRelease.
# Usage (from mobile/):
#   npm run android:bundleRelease
#   npm run android:bundleRelease -- -NoVersionBump   # retry failed build only (same version)

param(
    [ValidateSet('patch', 'minor', 'major')]
    [string]$BumpType = 'patch',
    [switch]$NoVersionBump,
    [switch]$SkipKeystoreVerify
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$gradleFile = Join-Path $repoRoot 'android\app\build.gradle'
$mobilePkg = Join-Path $repoRoot 'mobile\package.json'
$androidDir = Join-Path $repoRoot 'android'
$mobileDir = Join-Path $repoRoot 'mobile'
$aabPath = Join-Path $repoRoot 'android\app\build\outputs\bundle\release\app-release.aab'

function Resolve-JavaHome {
    if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
        return $env:JAVA_HOME
    }
    $candidates = @(
        'F:\Program Files\Android\Android Studio\jbr',
        'C:\Program Files\Android\Android Studio\jbr',
        (Join-Path $env:ProgramFiles 'Android\Android Studio\jbr'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Android Studio\jbr')
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path (Join-Path $candidate 'bin\java.exe'))) {
            return $candidate
        }
    }
    throw @"
JAVA_HOME is not set and Android Studio JBR was not found.

Install Android Studio, or set JAVA_HOME for this session:
  `$env:JAVA_HOME = "F:\Program Files\Android\Android Studio\jbr"
"@
}

function Get-AndroidVersion {
    $content = Get-Content $gradleFile -Raw -Encoding UTF8
    if ($content -notmatch 'versionCode\s+(\d+)') {
        throw "versionCode not found in $gradleFile"
    }
    $code = [int]$Matches[1]
    if ($content -notmatch 'versionName\s+"([^"]+)"') {
        throw "versionName not found in $gradleFile"
    }
    $name = $Matches[1]
    return @{ Code = $code; Name = $name }
}

function Set-AndroidVersion {
    param([int]$Code, [string]$Name)
    $content = Get-Content $gradleFile -Raw -Encoding UTF8
    $content = $content -replace 'versionCode\s+\d+', "versionCode $Code"
    $content = $content -replace 'versionName\s+"[^"]+"', "versionName `"$Name`""
    [System.IO.File]::WriteAllText($gradleFile, $content)

    $pkgContent = Get-Content $mobilePkg -Raw -Encoding UTF8
    $pkgContent = $pkgContent -replace '"version"\s*:\s*"[^"]+"', "`"version`": `"$Name`""
    [System.IO.File]::WriteAllText($mobilePkg, $pkgContent)
}

function VersionCodeFromName {
    param([string]$Name)
    # Match project convention: 1.0.8 -> 108, 1.1.11 -> 111, 1.1.12 -> 112 (join segments, no padding)
    $segments = $Name.Split('.') | ForEach-Object { $_.Trim() }
    while ($segments.Count -lt 3) { $segments += '0' }
    return [int]($segments[0] + $segments[1] + $segments[2])
}

function Bump-AndroidVersion {
    $before = Get-AndroidVersion
    $oldCode = $before.Code
    $oldName = $before.Name

    $segments = $oldName.Split('.') | ForEach-Object { [int]$_ }
    while ($segments.Count -lt 3) { $segments += 0 }

    switch ($BumpType) {
        'major' { $segments[0]++; $segments[1] = 0; $segments[2] = 0 }
        'minor' { $segments[1]++; $segments[2] = 0 }
        default  { $segments[2]++ }
    }
    $newName = "$($segments[0]).$($segments[1]).$($segments[2])"
    $computedCode = VersionCodeFromName $newName
  # Play requires versionCode to strictly increase; never reuse a published code
    $newCode = [Math]::Max($computedCode, $oldCode + 1)

    Set-AndroidVersion -Code $newCode -Name $newName

    $after = Get-AndroidVersion
    if ($after.Code -ne $newCode -or $after.Name -ne $newName) {
        throw "Version bump failed to persist in build.gradle (expected $newName / $newCode, got $($after.Name) / $($after.Code))"
    }
    if ($after.Code -le $oldCode) {
        throw "versionCode must increase (was $oldCode, now $($after.Code))"
    }

    Write-Host "Version bumped: $oldName (code $oldCode) -> $($after.Name) (code $($after.Code))" -ForegroundColor Cyan
    return $after
}

function Get-AabVersionCode {
    # aapt dump badging only works on APK; skip AAB verification (Gradle uses build.gradle at build time)
    param([string]$Path)
    return $null
}

Write-Host '=== OBO Stores - Play Store AAB build ===' -ForegroundColor Cyan

$env:JAVA_HOME = Resolve-JavaHome
$env:Path = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:Path
Write-Host "JAVA_HOME: $($env:JAVA_HOME)"

if (-not $env:ANDROID_HOME) {
    $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
    if (Test-Path $sdk) {
        $env:ANDROID_HOME = $sdk
        Write-Host "ANDROID_HOME: $sdk"
    }
}

$releaseVersion = $null
if (-not $NoVersionBump) {
    $releaseVersion = Bump-AndroidVersion
} else {
    $releaseVersion = Get-AndroidVersion
    Write-Host "WARNING: -NoVersionBump - building same version $($releaseVersion.Name) (code $($releaseVersion.Code))." -ForegroundColor Yellow
    Write-Host '         Use only to retry a failed build. Play Console requires a higher versionCode for new uploads.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host "Release version: $($releaseVersion.Name) (versionCode $($releaseVersion.Code))" -ForegroundColor Green

if (-not $SkipKeystoreVerify) {
    Write-Host ''
    Write-Host 'Verifying release keystore...' -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot 'verify-keystore.ps1')
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host ''
Write-Host 'Building web app + syncing Capacitor...' -ForegroundColor Cyan
Push-Location $mobileDir
try {
    npm run cap:sync
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}

$afterSync = Get-AndroidVersion
if ($afterSync.Code -ne $releaseVersion.Code -or $afterSync.Name -ne $releaseVersion.Name) {
    throw "build.gradle version changed during cap:sync (expected $($releaseVersion.Name)/$($releaseVersion.Code), got $($afterSync.Name)/$($afterSync.Code))"
}

Write-Host ''
Write-Host ('Running Gradle bundleRelease (v{0}, code {1})...' -f $releaseVersion.Name, $releaseVersion.Code) -ForegroundColor Cyan
Push-Location $androidDir
try {
    & .\gradlew.bat bundleRelease
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}

Write-Host ''
if (Test-Path $aabPath) {
    $aabCode = Get-AabVersionCode $aabPath
    if ($null -ne $aabCode -and $aabCode -ne $releaseVersion.Code) {
        throw "AAB versionCode mismatch: build.gradle has $($releaseVersion.Code) but AAB contains $aabCode. Do not upload this file."
    }
    Write-Host 'Build succeeded.' -ForegroundColor Green
    Write-Host "  versionName: $($releaseVersion.Name)"
    Write-Host "  versionCode: $($releaseVersion.Code)"
    if ($null -ne $aabCode) { Write-Host "  AAB verified:  versionCode $aabCode" }
    Write-Host ''
    Write-Host 'Upload to Google Play Console:' -ForegroundColor Green
    Write-Host $aabPath
} else {
    Write-Host "Build finished but AAB not found at expected path: $aabPath" -ForegroundColor Yellow
}
