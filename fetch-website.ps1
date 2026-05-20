# ============================================================
# MyShop - Fetch website/ from GitHub
# ============================================================
# Overwrites the local website/ folder with the version on the remote
# branch (default: origin/main). Use when another teammate updates the
# marketing site in the MyShop repo.
#
# Usage:
#   .\fetch-website.ps1
#   .\fetch-website.ps1 -Branch main
#   .\fetch-website.ps1 -Force          # overwrite even if website/ has local edits
#   .\fetch-website.ps1 -SkipInstall    # skip npm install in website/
# ============================================================

param(
    [string]$Remote = "origin",
    [string]$Branch = "main",
    [switch]$Force,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

function Write-Step($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host $msg -ForegroundColor Green }
function Write-Warn($msg) { Write-Host $msg -ForegroundColor Yellow }

Write-Host ""
Write-Host "=============================================" -ForegroundColor White
Write-Host "  MyShop - Fetch website/ from GitHub" -ForegroundColor White
Write-Host "=============================================" -ForegroundColor White
Write-Host ""

if (-not (Test-Path (Join-Path $ProjectRoot ".git"))) {
    throw "Not a git repository. Run this from the MyShop repo root."
}

if (-not (Test-Path (Join-Path $ProjectRoot "website"))) {
    Write-Warn "Local website/ folder not found; it will be created from the remote."
}

Write-Step "[1/3] Checking for uncommitted changes in website/ ..."
$dirty = git status --porcelain -- website/ 2>$null
if ($dirty -and -not $Force) {
    Write-Warn "website/ has local changes:"
    $dirty | ForEach-Object { Write-Host "  $_" }
    Write-Host ""
    throw "Aborting to avoid losing work. Commit or stash first, or re-run with -Force."
}

Write-Step "[2/3] Fetching $Remote/$Branch and updating website/ ..."
git fetch $Remote $Branch
if ($LASTEXITCODE -ne 0) { throw "git fetch failed." }

$ref = "$Remote/$Branch"
git rev-parse --verify "$ref" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Remote ref not found: $ref (check branch name)." }

git checkout "$ref" -- website/
if ($LASTEXITCODE -ne 0) { throw "git checkout failed for website/." }

Write-Ok "  website/ updated from $ref"

if (-not $SkipInstall) {
    Write-Step "[3/3] Installing website dependencies (npm install) ..."
    Push-Location (Join-Path $ProjectRoot "website")
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed in website/." }
        Write-Ok "  Dependencies installed."
    }
    finally {
        Pop-Location
    }
} else {
    Write-Warn "[3/3] Skipped npm install (-SkipInstall)."
}

Write-Host ""
Write-Ok "Done. website/ matches $ref"
Write-Host "  Preview:  npm run dev:website" -ForegroundColor Gray
Write-Host "  Build:    npm run build:website" -ForegroundColor Gray
Write-Host ""
Write-Warn "Note: git checkout stages website/ files. Run 'git status' to review before committing."
Write-Host ""
