<#
.SYNOPSIS
  Checks every URL in url-list.txt and reports status codes that do not match
  the expected value.

.DESCRIPTION
  Reads migration/url-list.txt, which contains lines of the form:

      <expected-status> <url>

  Lines starting with # and blank lines are ignored. For each URL, issues a GET
  without following redirects, then reports:
    OK       the status matched the expected status
    MISMATCH the status differed (a 301 where 200 was expected, for example)
    ERROR    the request failed entirely

  A 301 is reported as OK when any 3xx was expected, since the destination
  itself is verified by its own entry in the list.

.PARAMETER BaseUrl
  Replaces the origin of every URL, so the same list can be run against a
  preview deployment. Example:

      .\migration\check-urls.ps1 -BaseUrl https://my-branch.pages.dev

.EXAMPLE
  .\migration\check-urls.ps1
  .\migration\check-urls.ps1 -BaseUrl https://my-branch.pages.dev -Verbose
#>
[CmdletBinding()]
param(
    [string]$BaseUrl
)

$ErrorActionPreference = 'Continue'

$listPath = Join-Path $PSScriptRoot 'url-list.txt'
if (-not (Test-Path $listPath)) {
    Write-Error "url-list.txt not found at $listPath"
    exit 1
}

$entries = Get-Content $listPath |
    Where-Object { $_ -match '\S' -and $_ -notmatch '^\s*#' } |
    ForEach-Object {
        if ($_ -match '^\s*(\d{3})\s+(\S+)\s*$') {
            [pscustomobject]@{
                Expected = [int]$Matches[1]
                Url      = $Matches[2]
            }
        }
    }

$ok = 0
$bad = @()

foreach ($entry in $entries) {
    $url = $entry.Url
    if ($BaseUrl) {
        $uri = [Uri]$entry.Url
        $url = "$($BaseUrl.TrimEnd('/'))$($uri.PathAndQuery)"
    }

    $status = curl.exe -s -o NUL -w '%{http_code}' $url
    if (-not $status -or $status -eq '000') {
        Write-Host ("ERROR   {0}  {1}" -f '???', $url) -ForegroundColor Red
        $bad += [pscustomobject]@{ Url = $url; Expected = $entry.Expected; Actual = 'no response' }
        continue
    }

    $actual = [int]$status
    $matches = $actual -eq $entry.Expected
    if (-not $matches -and $entry.Expected -ge 300 -and $entry.Expected -lt 400 -and $actual -ge 300 -and $actual -lt 400) {
        $matches = $true
    }

    if ($matches) {
        Write-Host ("OK      {0}  {1}" -f $actual, $url) -ForegroundColor Green
        $ok++
    }
    else {
        Write-Host ("MISMATCH expected {0}, got {1}  {2}" -f $entry.Expected, $actual, $url) -ForegroundColor Yellow
        $bad += [pscustomobject]@{ Url = $url; Expected = $entry.Expected; Actual = $actual }
    }
}

Write-Host ''
Write-Host ("{0} of {1} matched." -f $ok, $entries.Count) -ForegroundColor Cyan

if ($bad.Count -gt 0) {
    Write-Host ''
    Write-Host 'Needs attention:' -ForegroundColor Yellow
    $bad | Format-Table -AutoSize | Out-String | Write-Host
    exit 1
}

exit 0
