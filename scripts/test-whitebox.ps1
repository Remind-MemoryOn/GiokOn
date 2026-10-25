param(
  [string]$ToolsDirectory = (Join-Path $env:TEMP 'memoryon-whitebox-tools-20261025'),
  [switch]$Browser
)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$tools = [IO.Path]::GetFullPath($ToolsDirectory)
$vitest = Join-Path $tools 'node_modules/vitest/vitest.mjs'
if (!(Test-Path -LiteralPath $vitest)) {
  throw 'External coverage tools are missing. See docs/testing/2026-10-25-whitebox-report.md for the Windows cmd installation command.'
}
$previousLocation = Get-Location
$previousScope = $env:WHITEBOX_SCOPE
$previousTools = $env:WHITEBOX_TOOLS_DIR
$failed = @()
try {
  $env:WHITEBOX_TOOLS_DIR = $tools
  foreach ($scope in @('core', 'data', 'mobile', 'relay', 'web')) {
    $env:WHITEBOX_SCOPE = $scope
    if ($scope -eq 'relay') { Set-Location -LiteralPath (Join-Path $workspace 'apps/voice-relay') }
    else { Set-Location -LiteralPath $workspace }
    & node $vitest run --config (Join-Path $workspace 'scripts/whitebox-coverage.config.mjs')
    if ($LASTEXITCODE -ne 0) { $failed += $scope }
  }
  if ($Browser) {
    Set-Location -LiteralPath $workspace
    $browserRuns = @()
    foreach ($suite in @('auth-isolation', 'login-return-smoke', 'journal-flow-smoke', 'share-flow-smoke',
      'chronicle-flow-smoke', 'charts-smoke', 'analysis-period-flow-smoke', 'org-admin-flow-smoke',
      'session-plan-flow-smoke', 'elder-grade-flow-smoke', 'elder-delete-flow-smoke', 'viewport-mode-smoke',
      'supervision-flow-smoke', 'design-feedback-smoke', 'blackbox-flow-smoke', 'usecase-flow-smoke')) {
      & node apps/web/scripts/whitebox-browser.mjs "$suite.mjs"
      $suiteExit = $LASTEXITCODE
      $browserRuns += [pscustomobject]@{ suite = "$suite.mjs"; exit = $suiteExit }
      $resultDirectory = Join-Path $workspace '.tmp/whitebox-2026-10-25'
      New-Item -ItemType Directory -Path $resultDirectory -Force | Out-Null
      [IO.File]::WriteAllText((Join-Path $resultDirectory 'web-browser-final-runs.json'),
        ($browserRuns | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
      if ($suiteExit -ne 0) { $failed += $suite }
    }
  }
} finally {
  Set-Location -LiteralPath $previousLocation
  $env:WHITEBOX_SCOPE = $previousScope
  $env:WHITEBOX_TOOLS_DIR = $previousTools
}
if ($failed.Count) { throw ('White-box checks failed: ' + ($failed -join ', ')) }
