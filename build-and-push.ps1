# ============================================================
# MyShop - Build, Version Increment & Push Script
# ============================================================
# This script:
#   1. Auto-increments the patch version (e.g. 1.0.0 -> 1.0.1)
#   2. Builds the installable Windows client app (NSIS installer)
#   3. Commits all changes and pushes to GitHub
#
# Usage:
#   .\build-and-push.ps1                  # patch bump (default)
#   .\build-and-push.ps1 -BumpType minor  # minor bump (1.0.0 -> 1.1.0)
#   .\build-and-push.ps1 -BumpType major  # major bump (1.0.0 -> 2.0.0)
#   .\build-and-push.ps1 -Message "feat: add new feature"  # custom commit message
# ============================================================

param(
    [ValidateSet("patch", "minor", "major")]
    [string]$BumpType = "patch",
    [string]$Message = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# -----------------------------------------------------------
# Helper: Increment a semver string
# -----------------------------------------------------------
function Bump-Version {
    param(
        [string]$Version,
        [string]$Type
    )
    $parts = $Version -split '\.'
    $major = [int]$parts[0]
    $minor = [int]$parts[1]
    $patch = [int]$parts[2]

    switch ($Type) {
        "major" { $major++; $minor = 0; $patch = 0 }
        "minor" { $minor++; $patch = 0 }
        "patch" { $patch++ }
    }
    return "$major.$minor.$patch"
}

# -----------------------------------------------------------
# Helper: Update version in a package.json file
# -----------------------------------------------------------
function Update-PackageVersion {
    param(
        [string]$FilePath,
        [string]$NewVersion
    )
    $content = Get-Content $FilePath -Raw
    $updated = $content -replace '"version"\s*:\s*"[^"]*"', "`"version`": `"$NewVersion`""
    Set-Content -Path $FilePath -Value $updated -NoNewline
    Write-Host "  Updated $FilePath -> v$NewVersion" -ForegroundColor Cyan
}

# ============================================================
Write-Host ""
Write-Host "=============================================" -ForegroundColor Magenta
Write-Host "  MyShop - Build, Version & Push" -ForegroundColor Magenta
Write-Host "=============================================" -ForegroundColor Magenta
Write-Host ""

# -----------------------------------------------------------
# Step 1: Read current version & bump
# -----------------------------------------------------------
Write-Host "[1/4] Incrementing version ($BumpType)..." -ForegroundColor Yellow

$rootPkg = Get-Content "$ProjectRoot\package.json" -Raw | ConvertFrom-Json
$currentVersion = $rootPkg.version
$newVersion = Bump-Version -Version $currentVersion -Type $BumpType

Write-Host "  Current version: v$currentVersion" -ForegroundColor DarkGray
Write-Host "  New version:     v$newVersion" -ForegroundColor Green

# Update all package.json files
Update-PackageVersion -FilePath "$ProjectRoot\package.json" -NewVersion $newVersion
Update-PackageVersion -FilePath "$ProjectRoot\client\package.json" -NewVersion $newVersion
Update-PackageVersion -FilePath "$ProjectRoot\server\package.json" -NewVersion $newVersion

Write-Host ""

# -----------------------------------------------------------
# Step 2: Build the installable Windows app
# -----------------------------------------------------------
Write-Host "[2/4] Building installable Windows app..." -ForegroundColor Yellow

Push-Location $ProjectRoot
try {
    # Build server
    Write-Host "  Building server..." -ForegroundColor Cyan
    Push-Location "$ProjectRoot\server"
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Server build failed!" }
    Pop-Location

    # Build client
    Write-Host "  Building client..." -ForegroundColor Cyan
    Push-Location "$ProjectRoot\client"
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Client build failed!" }
    Pop-Location

    # Package with electron-builder
    Write-Host "  Packaging with electron-builder..." -ForegroundColor Cyan
    npx electron-builder --win
    if ($LASTEXITCODE -ne 0) { throw "Electron build failed!" }

    Write-Host "  Build complete! Installer is in ./release/" -ForegroundColor Green
}
catch {
    Write-Host "  BUILD FAILED: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}
finally {
    Pop-Location
}

Write-Host ""

# -----------------------------------------------------------
# Step 3: Git commit
# -----------------------------------------------------------
Write-Host "[3/4] Committing changes..." -ForegroundColor Yellow

Push-Location $ProjectRoot
try {
    git add -A

    # Check if there are changes to commit
    $status = git status --porcelain
    if ([string]::IsNullOrWhiteSpace($status)) {
        Write-Host "  No changes to commit." -ForegroundColor DarkGray
    }
    else {
        if ([string]::IsNullOrWhiteSpace($Message)) {
            $commitMsg = "build: v$newVersion - release build"
        }
        else {
            $commitMsg = "$Message (v$newVersion)"
        }
        git commit -m $commitMsg
        Write-Host "  Committed: $commitMsg" -ForegroundColor Cyan
    }
}
finally {
    Pop-Location
}

Write-Host ""

# -----------------------------------------------------------
# Step 4: Push to GitHub
# -----------------------------------------------------------
Write-Host "[4/4] Pushing to GitHub..." -ForegroundColor Yellow

Push-Location $ProjectRoot
try {
    git push origin
    if ($LASTEXITCODE -ne 0) { throw "Git push failed!" }
    Write-Host "  Pushed to GitHub successfully!" -ForegroundColor Green
}
catch {
    Write-Host "  PUSH FAILED: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Magenta
Write-Host "  All done! v$newVersion deployed" -ForegroundColor Green
Write-Host "  Installer: ./release/" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Magenta
Write-Host ""
