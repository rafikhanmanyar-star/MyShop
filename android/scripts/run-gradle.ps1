# Run cap:sync then Gradle with auto-detected JAVA_HOME.
# Usage: run-gradle.ps1 assembleDebug | assembleRelease | bundleRelease

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('assembleDebug', 'assembleRelease', 'bundleRelease')]
    [string]$Task
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$androidDir = Join-Path $repoRoot 'android'
$mobileDir = Join-Path $repoRoot 'mobile'

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
    throw "JAVA_HOME not set and Android Studio JBR not found."
}

$env:JAVA_HOME = Resolve-JavaHome
$env:Path = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:Path

if (-not $env:ANDROID_HOME) {
    $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
    if (Test-Path $sdk) { $env:ANDROID_HOME = $sdk }
}

Push-Location $mobileDir
try {
    npm run cap:sync
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}

Push-Location $androidDir
try {
    & .\gradlew.bat $Task
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
