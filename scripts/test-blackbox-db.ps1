$ErrorActionPreference = 'Stop'
# Synthetic, network-isolated PostgreSQL only. Never loads environment files.
$workspace = Split-Path -Parent $PSScriptRoot
$container = 'giokon-blackbox-' + [Guid]::NewGuid().ToString('N')
function Invoke-DockerChecked {
  & docker @args
  if ($LASTEXITCODE -ne 0) { throw "Docker step failed: $($args[0])" }
}
try {
  Invoke-DockerChecked run -d --name $container --network none --tmpfs /var/lib/postgresql/data -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    & docker exec $container pg_isready -U postgres *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (!$ready) { throw 'Isolated PostgreSQL did not become ready' }
  Invoke-DockerChecked cp (Join-Path $workspace 'supabase/tests') "${container}:/tests"
  Invoke-DockerChecked cp (Join-Path $workspace 'supabase/migrations') "${container}:/migrations"
  Invoke-DockerChecked exec $container psql -U postgres -v ON_ERROR_STOP=1 -q -f /tests/_supabase_shims.sql
  foreach ($migration in (Get-ChildItem -LiteralPath (Join-Path $workspace 'supabase/migrations') -Filter '*.sql' | Sort-Object Name)) {
    Invoke-DockerChecked exec $container psql -U postgres -v ON_ERROR_STOP=1 -q -f "/migrations/$($migration.Name)"
  }
  Invoke-DockerChecked exec $container psql -U postgres -v ON_ERROR_STOP=1 -q -f /tests/_grants.sql
  $runner = Get-Content -LiteralPath (Join-Path $workspace 'supabase/tests/run-rls-regression.sh') -Raw
  $testFiles = [regex]::Matches($runner, '\$HERE/([a-z_]+\.sql)') | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -notmatch '^_' }
  foreach ($testFile in @($testFiles) + @('blackbox_decision_table.sql')) {
    Write-Output "TEST $testFile"
    Invoke-DockerChecked exec $container psql -U postgres -v ON_ERROR_STOP=1 -q -f "/tests/$testFile"
  }
  Write-Output "PASS: $(@($testFiles).Count) existing database suites and 8 black-box share combinations."
} finally {
  # Only the exact random container created for this invocation is removed.
  & docker rm -f $container | Out-Null
}
