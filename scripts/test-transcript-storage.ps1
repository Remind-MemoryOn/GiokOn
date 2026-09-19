$ErrorActionPreference = 'Stop'
# Isolated synthetic PostgreSQL only. Does not load project environment files.
$workspace = Split-Path -Parent $PSScriptRoot
$container = 'memoryon-transcript-' + [Guid]::NewGuid().ToString('N')
function Docker-Checked {
  & docker @args
  if ($LASTEXITCODE -ne 0) { throw "Docker step failed: $($args[0])" }
}
try {
  Docker-Checked run -d --name $container --network none --tmpfs /var/lib/postgresql/data -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16
  $ready = $false
  for ($attempt=0; $attempt -lt 30; $attempt++) {
    & docker exec $container pg_isready -U postgres *> $null
    if ($LASTEXITCODE -eq 0) { $ready=$true; break }
    Start-Sleep -Seconds 1
  }
  if (!$ready) { throw 'Isolated PostgreSQL did not become ready' }
  foreach ($name in @('_supabase_shims.sql')) {
    Docker-Checked cp (Join-Path $workspace "supabase/tests/$name") "${container}:/test.sql"
    Docker-Checked exec $container psql -U postgres -v ON_ERROR_STOP=1 -q -f /test.sql
  }
  foreach ($migration in (Get-ChildItem -LiteralPath (Join-Path $workspace 'supabase/migrations') -Filter '*.sql' | Sort-Object Name)) {
    Docker-Checked cp $migration.FullName "${container}:/migration.sql"
    Docker-Checked exec $container psql -U postgres -v ON_ERROR_STOP=1 -q -f /migration.sql
  }
  foreach ($name in @('_grants.sql','rls_regression.sql','transcript_provenance.sql')) {
    Docker-Checked cp (Join-Path $workspace "supabase/tests/$name") "${container}:/test.sql"
    Docker-Checked exec $container psql -U postgres -v ON_ERROR_STOP=1 -q -f /test.sql
  }
} finally {
  # The target is the random container created above, never another project.
  & docker rm -f $container | Out-Null
}
