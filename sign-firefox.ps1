# Signs the Codex Meter Firefox build with Mozilla (AMO).
#
# Prereqs (once):
#   1. Node.js installed
#   2. Install web-ext locally:
#        npm install --prefix .web-ext-tmp --ignore-scripts --no-audit --no-fund web-ext@8
#   3. Fill in amo-credentials.ps1 (gitignored, same folder) with your AMO
#      credentials from https://addons.mozilla.org/developers/manage/api-keys/:
#        AMO_API_KEY   = "<JWT 签发者 / JWT issuer>"
#        AMO_API_SECRET = "<JWT 私钥 / JWT secret>"
#      (credentials already set in this shell take precedence)
#
# Usage:
#   .\sign-firefox.ps1 -Channel unlisted   # self-distribution (GitHub Release etc.)
#   .\sign-firefox.ps1 -Channel listed     # submit to addons.mozilla.org for review
#
# The signed XPI lands in web-ext-artifacts\.

param(
  [ValidateSet("unlisted", "listed")]
  [string]$Channel = "unlisted"
)

$ErrorActionPreference = "Stop"

if (-not $env:AMO_API_KEY -or -not $env:AMO_API_SECRET) {
  $credFile = Join-Path $PSScriptRoot "amo-credentials.ps1"
  if (Test-Path $credFile) {
    . $credFile
  }
}

if (-not $env:AMO_API_KEY -or -not $env:AMO_API_SECRET) {
  throw "Set AMO_API_KEY / AMO_API_SECRET in amo-credentials.ps1 (or this shell) first."
}

if (-not (Test-Path ".web-ext-tmp/node_modules/web-ext/bin/web-ext.js")) {
  npm install --prefix .web-ext-tmp --ignore-scripts --no-audit --no-fund web-ext@8
  if ($LASTEXITCODE -ne 0) { throw "Failed to install web-ext." }
}

$env:WEB_EXT_NO_UPDATE_CHECK = "1"
node .web-ext-tmp/node_modules/web-ext/bin/web-ext.js sign `
  --source-dir codex-meter-extension `
  --channel $Channel `
  --api-key $env:AMO_API_KEY `
  --api-secret $env:AMO_API_SECRET

if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "Signed XPI written to web-ext-artifacts:"
  Get-ChildItem web-ext-artifacts -Filter *.zip | ForEach-Object { Write-Host ("  " + $_.Name) }
}
