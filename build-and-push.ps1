# ============================================================
# MyShop - Build, Version Increment & Push Script
# ============================================================
# This script:
#   1. Builds the installable Windows desktop app for the *next* semver (client-only; API & mobile on Render)
#   2. Only after a successful build: writes the new version to all package.json files
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
# Step 1: Resolve next version (files stay unchanged until build succeeds)
# -----------------------------------------------------------
Write-Host "[1/5] Next release version ($BumpType)..." -ForegroundColor Yellow

$rootPkg = Get-Content "$ProjectRoot\package.json" -Raw | ConvertFrom-Json
$currentVersion = $rootPkg.version
$newVersion = Bump-Version -Version $currentVersion -Type $BumpType

Write-Host "  Current package.json: v$currentVersion" -ForegroundColor DarkGray
Write-Host "  Will release as:      v$newVersion (written to disk only after a successful build)" -ForegroundColor Green

Write-Host ""

# -----------------------------------------------------------
# Step 2: Build installer for $newVersion (no package.json writes yet — failed builds leave versions unchanged)
# -----------------------------------------------------------
Write-Host "[2/5] Building installable Windows app (client only, API on Render)..." -ForegroundColor Yellow

Push-Location $ProjectRoot
try {
    # Align UI (__APP_VERSION__) and electron-builder artifact with $newVersion without bumping package.json first
    $env:RELEASE_APP_VERSION = $newVersion

    # Build client for cloud (set VITE_API_URL in client/.env or .env.cloud for your Render API URL)
    Write-Host "  Building client (cloud mode)..." -ForegroundColor Cyan
    Push-Location "$ProjectRoot\client"
    try {
        npm run build:cloud
        if ($LASTEXITCODE -ne 0) { throw "Client build failed!" }
    }
    finally {
        Pop-Location
    }

    # Package with electron-builder (client-only config; no embedded server)
    # Disable code signing so winCodeSign is not used (avoids Windows symlink errors when not in Developer Mode / Admin)
    $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
    Write-Host "  Packaging with electron-builder..." -ForegroundColor Cyan
    npx electron-builder --win -c electron-builder.cloud.json "-c.extraMetadata.version=$newVersion"
    if ($LASTEXITCODE -ne 0) { throw "Electron build failed!" }

    Write-Host "  Build complete! Installer is in ./release/" -ForegroundColor Green
}
catch {
    Write-Host "  BUILD FAILED: $_" -ForegroundColor Red
    exit 1
}
finally {
    Remove-Item Env:RELEASE_APP_VERSION -ErrorAction SilentlyContinue
    Pop-Location
}

Write-Host ""

# -----------------------------------------------------------
# Step 2b: Persist version only after a successful build
# -----------------------------------------------------------
Write-Host "  Writing v$newVersion to package.json files..." -ForegroundColor Cyan
Update-PackageVersion -FilePath "$ProjectRoot\package.json" -NewVersion $newVersion
Update-PackageVersion -FilePath "$ProjectRoot\client\package.json" -NewVersion $newVersion
Update-PackageVersion -FilePath "$ProjectRoot\server\package.json" -NewVersion $newVersion
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

        # Prune old GitHub releases: keep only the latest 3
        Write-Host "  Pruning old GitHub releases (keeping latest 3)..." -ForegroundColor Cyan
        $releasesJson = gh release list --json tagName,publishedAt --limit 100 2>$null
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($releasesJson)) {
            $releases = $releasesJson | ConvertFrom-Json
            $sorted = $releases | Sort-Object { [datetime]::Parse($_.publishedAt) } -Descending
            $toDelete = $sorted | Select-Object -Skip 3
            foreach ($r in $toDelete) {
                gh release delete $r.tagName --yes 2>$null
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "    Deleted GitHub release: $($r.tagName)" -ForegroundColor DarkGray
                }
            }
            if ($toDelete.Count -gt 0) {
                Write-Host "  Kept latest 3 GitHub releases; removed $($toDelete.Count) older." -ForegroundColor Green
            }
        }
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

# -----------------------------------------------------------
# Prune local release folder: keep only the latest 3 installer builds
# -----------------------------------------------------------
$releaseDir = "$ProjectRoot\release"
if (Test-Path $releaseDir) {
    Write-Host ""
    Write-Host "Pruning local release folder (keeping latest 3 builds)..." -ForegroundColor Yellow
    $installers = Get-ChildItem -Path $releaseDir -Filter "MyShop-Setup-*.exe" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch "unpacked" }
    $withVersion = @()
    foreach ($f in $installers) {
        if ($f.Name -match "MyShop-Setup-([\d\.]+)\.exe") {
            $withVersion += [PSCustomObject]@{ File = $f; Version = $matches[1] }
        }
    }
    if ($withVersion.Count -gt 3) {
        $sortedInstallers = $withVersion | Sort-Object { [version]$_.Version } -Descending
        $toRemove = $sortedInstallers | Select-Object -Skip 3
        foreach ($x in $toRemove) {
            Remove-Item $x.File.FullName -Force -ErrorAction SilentlyContinue
            $blockmap = $x.File.FullName + ".blockmap"
            if (Test-Path $blockmap) { Remove-Item $blockmap -Force -ErrorAction SilentlyContinue }
            Write-Host "  Removed local: $($x.File.Name)" -ForegroundColor DarkGray
        }
        Write-Host "  Local release folder: kept latest 3 builds; removed $($toRemove.Count) older." -ForegroundColor Green
    }
    else {
        Write-Host "  Local release folder: $($withVersion.Count) build(s), no pruning needed." -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Magenta
Write-Host "  All done! v$newVersion" -ForegroundColor Green
Write-Host "  Installer: ./release/" -ForegroundColor Green
Write-Host "  Single command: npm run release" -ForegroundColor DarkGray
Write-Host "=============================================" -ForegroundColor Magenta
Write-Host ""
