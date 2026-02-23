# ============================================================
# MyShop - Build, Version Increment & Push Script
# ============================================================
# This script:
#   1. Auto-increments the patch version (e.g. 1.0.0 -> 1.0.1)
#   2. Builds the installable Windows desktop app (client-only; API & mobile run on Render)
#   3. Commits all changes and pushes to GitHub
#   4. Creates a GitHub Release with the installer attached (requires: gh CLI, gh auth login)
#
# Usage:
#   .\build-and-push.ps1                  # patch bump (default)
#   .\build-and-push.ps1 -BumpType minor  # minor bump (1.0.0 -> 1.1.0)
#   .\build-and-push.ps1 -BumpType major  # major bump (1.0.0 -> 2.0.0)
#   .\build-and-push.ps1 -Message "feat: add new feature"  # custom commit message
#   .\build-and-push.ps1 -SkipRelease     # push without creating GitHub release
# ============================================================

param(
    [ValidateSet("patch", "minor", "major")]
    [string]$BumpType = "patch",
    [string]$Message = "",
    [switch]$SkipRelease
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
Write-Host "[1/5] Incrementing version ($BumpType)..." -ForegroundColor Yellow

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
# Step 2: Build the installable Windows app (client-only; API on Render)
# -----------------------------------------------------------
Write-Host "[2/5] Building installable Windows app (client only, API on Render)..." -ForegroundColor Yellow

Push-Location $ProjectRoot
try {
    # Build client for cloud (set VITE_API_URL in client/.env or .env.cloud for your Render API URL)
    Write-Host "  Building client (cloud mode)..." -ForegroundColor Cyan
    Push-Location "$ProjectRoot\client"
    npm run build:cloud
    if ($LASTEXITCODE -ne 0) { throw "Client build failed!" }
    Pop-Location

    # Package with electron-builder (client-only config; no embedded server)
    Write-Host "  Packaging with electron-builder..." -ForegroundColor Cyan
    npx electron-builder --win -c electron-builder.cloud.json
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
Write-Host "[3/5] Committing changes..." -ForegroundColor Yellow

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
Write-Host "[4/5] Pushing to GitHub..." -ForegroundColor Yellow

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

# -----------------------------------------------------------
# Step 5: Create GitHub Release and upload installer
# -----------------------------------------------------------
if (-not $SkipRelease) {
    Write-Host "[5/5] Creating GitHub Release v$newVersion..." -ForegroundColor Yellow
    $tagName = "v$newVersion"
    $installerName = "MyShop Setup $newVersion.exe"
    $installerPath = "$ProjectRoot\release\$installerName"

    if (-not (Test-Path $installerPath)) {
        Write-Host "  Installer not found: $installerPath" -ForegroundColor Red
        Write-Host "  Skipping release. Use -SkipRelease to suppress this step." -ForegroundColor DarkGray
    } else {
        try {
            gh release create $tagName $installerPath --title $tagName --notes "MyShop desktop app v$newVersion"
            if ($LASTEXITCODE -ne 0) { throw "gh release create failed" }
            Write-Host "  Release created: $tagName" -ForegroundColor Green
            Write-Host "  Installer uploaded. Users can update via Settings -> Check for updates." -ForegroundColor Green
        } catch {
            Write-Host "  Release failed (install gh and run 'gh auth login' if needed): $_" -ForegroundColor Yellow
            Write-Host "  Installer is in ./release/ - upload manually to GitHub Releases if desired." -ForegroundColor DarkGray
        }
    }
} else {
    Write-Host "[5/5] Skipping GitHub Release (-SkipRelease)." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Magenta
Write-Host "  All done! v$newVersion" -ForegroundColor Green
Write-Host "  Installer: ./release/" -ForegroundColor Green
Write-Host "  Single command: npm run release" -ForegroundColor DarkGray
Write-Host "=============================================" -ForegroundColor Magenta
Write-Host ""
