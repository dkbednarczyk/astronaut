<#
.SYNOPSIS
  Read, correct, or reset upvote counts in the D1 database.

.DESCRIPTION
  Run these when a count looks wrong, or after a bot incident. Every command
  prints the current counts first so you always see what you are about to
  change.

  Counts are per slug, one row per post. `voters` holds the deduplication
  records; deleting a count but keeping voters means the people who already
  voted cannot vote again, which is usually what you want after a correction.

.PARAMETER Action
  list      Show all counts (default, read-only)
  show      Show one post's count
  set       Set one post's count to an exact number
  reset     Set one post's count to 0, keeping voters records
  wipe      Set every post's count to 0
  drop      Delete all counts and all voter records (full reset)

.PARAMETER Slug
  Post slug, e.g. two-knights. Not needed for list, wipe, or drop.

.PARAMETER Count
  New count. Only used with -Action set.

.PARAMETER Remote
  Operate on the live database. Without this, changes apply only to the local
  database used by `wrangler pages dev`.

.EXAMPLE
  .\migration\votes.ps1
  .\migration\votes.ps1 -Action show -Slug two-knights -Remote
  .\migration\votes.ps1 -Action set -Slug two-knights -Count 3 -Remote
  .\migration\votes.ps1 -Action reset -Slug two-knights -Remote
  .\migration\votes.ps1 -Action wipe -Remote
#>
[CmdletBinding()]
param(
    [ValidateSet("list", "show", "set", "reset", "wipe", "drop")]
    [string]$Action = "list",
    [string]$Slug,
    [int]$Count = 0,
    [switch]$Remote
)

$ErrorActionPreference = 'Stop'

$database = "upvotes"
$flag = if ($Remote) { "--remote" } else { "--local" }
$target = if ($Remote) { "the LIVE database" } else { "the LOCAL database" }

function Invoke-D1 {
    param([string]$Sql)
    $output = & bunx wrangler d1 execute $database $flag --command $Sql --json 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "wrangler failed:" -ForegroundColor Red
        $output | Write-Host
        exit 1
    }
    return $output -join "`n" | ConvertFrom-Json
}

function Get-Counts {
    $result = Invoke-D1 "SELECT slug, count FROM votes ORDER BY slug"
    return $result[0].results
}

function Show-Counts {
    $counts = @(Get-Counts)
    if ($counts.Count -eq 0) {
        Write-Host "No counts recorded yet." -ForegroundColor Yellow
        return
    }
    Write-Host ""
    Write-Host ("{0,-36} {1,6}" -f "slug", "count")
    Write-Host ("-" * 43)
    foreach ($row in $counts) {
        Write-Host ("{0,-36} {1,6}" -f $row.slug, $row.count)
    }
    Write-Host ""
}

Write-Host "Target: $target" -ForegroundColor Cyan

if ($Action -eq "list") {
    Show-Counts
    exit 0
}

if ($Action -in @("show")) {
    if (-not $Slug) { Write-Error "-Slug is required for -Action $Action"; exit 1 }
    Show-Counts
    $row = @(Get-Counts) | Where-Object { $_.slug -eq $Slug }
    if (-not $row) {
        Write-Host "No count for '$Slug'. Valid slugs are listed above." -ForegroundColor Yellow
        exit 1
    }
    exit 0
}

# Destructive actions: confirm before touching anything.
Write-Host ""
Show-Counts
$confirmation = "no"
if ($Remote) {
    $confirmation = Read-Host "This changes $target. Type 'yes' to continue"
    if ($confirmation -ne "yes") {
        Write-Host "Cancelled. Nothing was changed." -ForegroundColor Yellow
        exit 1
    }
}
elseif (-not (Read-Host "Type 'yes' to continue")) {
    Write-Host "Cancelled. Nothing was changed." -ForegroundColor Yellow
    exit 1
}

switch ($Action) {
    "set" {
        if (-not $Slug) { Write-Error "-Slug is required for -Action set"; exit 1 }
        if ($Count -lt 0) { Write-Error "-Count cannot be negative"; exit 1 }
        $null = Invoke-D1 "INSERT INTO votes (slug, count) VALUES ('$Slug', $Count) ON CONFLICT(slug) DO UPDATE SET count = $Count"
        Write-Host "Set '$Slug' to $Count." -ForegroundColor Green
    }
    "reset" {
        if (-not $Slug) { Write-Error "-Slug is required for -Action reset"; exit 1 }
        $null = Invoke-D1 "UPDATE votes SET count = 0 WHERE slug = '$Slug'"
        Write-Host "Reset '$Slug' to 0. Existing voters keep their records, so they cannot re-vote." -ForegroundColor Green
    }
    "wipe" {
        $null = Invoke-D1 "UPDATE votes SET count = 0"
        Write-Host "Reset every post to 0. Voter records kept." -ForegroundColor Green
    }
    "drop" {
        $null = Invoke-D1 "DELETE FROM votes; DELETE FROM voters"
        Write-Host "Deleted all counts and all voter records. Everyone may vote again." -ForegroundColor Green
    }
}

Write-Host ""
Show-Counts
