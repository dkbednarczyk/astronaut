<#
.SYNOPSIS
  Integration tests for the upvote Pages Function against `wrangler pages dev`.

.DESCRIPTION
  Exercises the real HTTP surface with real cookies. Two PowerShell quirks are
  worked around here:
    - curl must be invoked via an argument array; passing headers inline can
      drop them and fail with exit 6.
    - curl's cookie jar refuses Secure cookies over plain http, so cookies are
      read from Set-Cookie and passed back with -H.

  Covers: identity issuance, one-vote-per-identity, independence between
  identities sharing an IP, per-post separation, forged/unsigned cookies,
  unknown slugs, and that a GET does not consume a vote.

.EXAMPLE
  .\migration\test-upvote-api.ps1
  .\migration\test-upvote-api.ps1 -BaseUrl https://my-branch.pages.dev
#>
[CmdletBinding()]
param(
    [string]$BaseUrl = "http://127.0.0.1:8788"
)

$ErrorActionPreference = 'Continue'

function Invoke-Api {
    param(
        [string]$Method = "GET",
        [string]$Slug,
        [string]$Cookie,
        [string]$Ip
    )

    $arguments = @("-s", "-D", "-", "-X", $Method, "--url", "$BaseUrl/api/upvote/$Slug")
    if ($Cookie) { $arguments += @("-H", "Cookie: __Host-upvote=$Cookie") }
    if ($Ip) { $arguments += @("-H", "CF-Connecting-IP: $Ip") }

    $raw = & curl.exe @arguments
    $text = $raw -join "`n"

    $status = if ($text -match "HTTP/1\.1 (\d{3})") { [int]$Matches[1] } else { 0 }
    $body = $text.Substring($text.LastIndexOf("`n`n") + 2).Trim()
    $setCookie = if ($text -match "__Host-upvote=([^;\r\n]+)") { $Matches[1] } else { $null }

    [pscustomobject]@{ Status = $status; Body = $body; Cookie = $setCookie }
}

$script:failures = 0

function Check {
    param([string]$Name, [bool]$Ok, [string]$Detail = "")
    if ($Ok) {
        Write-Host "  PASS  $Name" -ForegroundColor Green
    }
    else {
        $script:failures++
        Write-Host "  FAIL  $Name" -ForegroundColor Red
        if ($Detail) { Write-Host "        $Detail" -ForegroundColor Red }
    }
}

function CheckEqual {
    param([string]$Name, $Expected, $Actual)
    Check $Name ($Expected -eq $Actual) "expected '$Expected', got '$Actual'"
}

Write-Host "Testing upvote API at $BaseUrl`n"

# ---------------------------------------------------------------- identities
Write-Host "`n1. Identity issuance"
$g1 = Invoke-Api -Method GET -Slug "two-knights"
CheckEqual "GET returns 200" 200 $g1.Status
CheckEqual "GET returns count 0" '{"count":0}' $g1.Body
Check "GET sets an identity cookie" ($null -ne $g1.Cookie) "no Set-Cookie header"
Check "cookie is id.signature" ($g1.Cookie -match '^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$') "cookie: $($g1.Cookie)"

$g2 = Invoke-Api -Method GET -Slug "two-knights"
Check "second visitor gets a different cookie" ($g1.Cookie -ne $g2.Cookie)

$g3 = Invoke-Api -Method GET -Slug "two-knights" -Cookie $g1.Cookie
Check "returning visitor keeps the same cookie" ($null -eq $g3.Cookie) "server re-issued a cookie to an identified visitor"

# ------------------------------------------------------------------- voting
Write-Host "`n2. One vote per identity"
$p1 = Invoke-Api -Method POST -Slug "two-knights" -Cookie $g1.Cookie
CheckEqual "first vote returns 200" 200 $p1.Status
CheckEqual "first vote counts" '{"count":1,"voted":true}' $p1.Body

$p2 = Invoke-Api -Method POST -Slug "two-knights" -Cookie $g1.Cookie
CheckEqual "repeat vote does not double count" '{"count":1,"voted":false}' $p2.Body

Write-Host "`n3. Two people behind one IP both get to vote"
# The original defect: IP-only identity made the second reader at a NAT'd
# household or campus unable to vote. Identity is the cookie, not the IP.
$natA = (Invoke-Api -Method GET -Slug "two-knights").Cookie
$natB = (Invoke-Api -Method GET -Slug "two-knights").Cookie
$nat1 = Invoke-Api -Method POST -Slug "two-knights" -Cookie $natA -Ip "203.0.113.50"
$nat2 = Invoke-Api -Method POST -Slug "two-knights" -Cookie $natB -Ip "203.0.113.50"
$nat3 = Invoke-Api -Method POST -Slug "two-knights" -Cookie $natA -Ip "203.0.113.50"
CheckEqual "first reader on shared IP votes" '{"count":2,"voted":true}' $nat1.Body
CheckEqual "second reader on shared IP also votes" '{"count":3,"voted":true}' $nat2.Body
CheckEqual "first reader still cannot vote twice" '{"count":3,"voted":false}' $nat3.Body

Write-Host "`n4. One identity, several posts"
$post = Invoke-Api -Method POST -Slug "the-pursuit-of-tokens" -Cookie $g1.Cookie
CheckEqual "same identity votes on a different post" '{"count":1,"voted":true}' $post.Body

Write-Host "`n5. Forged and unsigned cookies are rejected"
$forged = Invoke-Api -Method POST -Slug "two-knights" -Cookie "AAAAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
CheckEqual "cookie with a bad signature is refused" 400 $forged.Status
Check "refusal is a JSON error" ($forged.Body -match '"no_identity"') $forged.Body

$unsigned = Invoke-Api -Method POST -Slug "two-knights" -Cookie "AAAAAAAAAAAAAAAAAAAAAA"
CheckEqual "unsigned cookie is refused" 400 $unsigned.Status

$none = Invoke-Api -Method POST -Slug "two-knights"
CheckEqual "POST with no cookie is refused" 400 $none.Status
Check "refusal tells the user to reload" ($none.Body -match "Reload the page") $none.Body

$tampered = $g1.Cookie.Substring(0, 22) + "." + ("A" * 43)
$bad = Invoke-Api -Method POST -Slug "two-knights" -Cookie $tampered
CheckEqual "cookie signed over a different id is refused" 400 $bad.Status

Write-Host "`n6. Slug validation"
foreach ($slug in @("not-a-real-post", "..%2f..%2fetc", "two-knights'", "TWO-KNIGHTS")) {
    $r = Invoke-Api -Method POST -Slug $slug -Cookie $g1.Cookie
    CheckEqual "POST '$slug' returns 404" 404 $r.Status
    $g = Invoke-Api -Method GET -Slug $slug
    CheckEqual "GET '$slug' returns 404" 404 $g.Status
}

Write-Host "`n7. Reading does not consume a vote"
$before = (Invoke-Api -Method GET -Slug "two-knights").Body
$null = Invoke-Api -Method GET -Slug "two-knights"
$null = Invoke-Api -Method GET -Slug "two-knights"
$after = (Invoke-Api -Method GET -Slug "two-knights").Body
CheckEqual "repeated GETs leave the count alone" $before $after

Write-Host ""
if ($script:failures -eq 0) {
    Write-Host "All API assertions passed." -ForegroundColor Cyan
    exit 0
}
Write-Host "$script:failures API assertion(s) failed." -ForegroundColor Red
exit 1
