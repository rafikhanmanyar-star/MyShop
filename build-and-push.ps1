# ============================================================
# MyShop - Build, Version Increment & Push Script
# ============================================================
# This script:
#   1. Auto-increments the patch version (e.g. 1.0.0 -> 1.0.1)
#   2. Builds the installable Windows desktop app (client-only; API & mobile run on Render)
#   3. Commits all changes and pushes to GitHub
#   4. Creates a GitHub Release and UPLOADS the .exe (so Settings -> App -> Check for updates works)
#      Requires: GitHub CLI installed + gh auth login
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
    # Disable code signing so winCodeSign is not used (avoids Windows symlink errors when not in Developer Mode / Admin)
    $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
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
# Step 5: Create GitHub Release and UPLOAD installer + latest.yml
#        (electron-updater requires latest.yml to detect and download updates)
# -----------------------------------------------------------
if (-not $SkipRelease) {
    Write-Host "[5/5] Creating GitHub Release and uploading installer + latest.yml + blockmap..." -ForegroundColor Yellow

    # Require GitHub CLI so the in-app updater can find the release
    $ghCmd = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $ghCmd) {
        Write-Host "  GitHub CLI (gh) is not installed. Install it so the .exe is uploaded to Releases." -ForegroundColor Red
        Write-Host "  Install: winget install GitHub.cli" -ForegroundColor Cyan
        Write-Host "  Then run: gh auth login" -ForegroundColor Cyan
        Write-Host "  Then run this script again: npm run release" -ForegroundColor Cyan
        exit 1
    }

    $tagName = "v$newVersion"
    # Match electron-builder artifactName: MyShop-Setup-1.0.6.exe
    $installerName = "MyShop-Setup-$newVersion.exe"
    $installerPath = "$ProjectRoot\release\$installerName"
    $latestYmlPath = "$ProjectRoot\release\latest.yml"

    if (-not (Test-Path $installerPath)) {
        $fallback = Get-ChildItem -Path "$ProjectRoot\release" -Filter "MyShop*.exe" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch "unpacked" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($fallback) {
            $installerPath = $fallback.FullName
            Write-Host "  Using installer: $($fallback.Name)" -ForegroundColor Cyan
        }
    }

    if (-not (Test-Path $installerPath)) {
        Write-Host "  Installer not found: $installerPath" -ForegroundColor Red
        Write-Host "  Build may have failed or output is elsewhere. Check ./release/" -ForegroundColor DarkGray
        exit 1
    }

    if (-not (Test-Path $latestYmlPath)) {
        Write-Host "  latest.yml not found: $latestYmlPath" -ForegroundColor Red
        Write-Host "  electron-updater needs this file in the release. Re-run the build." -ForegroundColor DarkGray
        exit 1
    }

    # Blockmap enables differential (delta) updates so users download only changed blocks
    $blockmapPath = $installerPath + ".blockmap"
    $releaseAssets = @($installerPath, $latestYmlPath)
    if (Test-Path $blockmapPath) {
        $releaseAssets += $blockmapPath
        Write-Host "  Blockmap found: $(Split-Path -Leaf $blockmapPath) (delta updates enabled)" -ForegroundColor Cyan
    } else {
        Write-Host "  Blockmap not found: $blockmapPath (updates will be full download)" -ForegroundColor DarkGray
    }

    Push-Location $ProjectRoot
    try {
        # Upload .exe, latest.yml, and .blockmap so in-app updates work (blockmap = delta updates)
        gh release create $tagName $releaseAssets --title $tagName --notes "MyShop desktop app v$newVersion"
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  gh release create failed. Run: gh auth login" -ForegroundColor Red
            exit 1
        }
        Write-Host "  Release created: $tagName" -ForegroundColor Green
        Write-Host "  Uploaded: installer + latest.yml" + $(if (Test-Path $blockmapPath) { " + blockmap (delta updates)" } else { "" }) -ForegroundColor Green
        Write-Host "  https://github.com/rafikhanmanyar-star/MyShop/releases" -ForegroundColor Green
        Write-Host "  Users can now use Settings -> App -> Check for updates." -ForegroundColor Green
    }
    catch {
        Write-Host "  Release failed: $_" -ForegroundColor Red
        Write-Host "  Run: gh auth login" -ForegroundColor Cyan
        Pop-Location
        exit 1
    }
    finally {
        Pop-Location
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
