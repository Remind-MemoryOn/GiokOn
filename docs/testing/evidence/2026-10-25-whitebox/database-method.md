# Isolated database guard mutations

run-db-mutants.ps1 reuses scripts/test-blackbox-db.ps1 through two temporary copies. Workspace is replaced with an explicit absolute local path; one temporary SQL migration override is copied into that invocation's random Docker container after the ordinary migrations directory is copied. The repository migration is never edited. Each container uses PostgreSQL16, network none and tmpfs, and is deleted in the runner's finally block. No environment files, real Supabase connections or production writes are involved.

Results (runner exit0 because both intended mutants were killed):
- HUMAN_ONLY raises removed (2 occurrences in the latest app.guard_program_journal_rules): child exit1 at pilot_access.sql:688, ASSERT `서비스 계정(auth.uid 없음)은 일지를 확정할 수 없어야 함`.
- JOURNAL_FINAL_DELETE_FORBIDDEN raise removed (1 occurrence): child exit1 at finalized_journal_integrity.sql:132, ASSERT `세션 삭제의 FK cascade 가 확정 일지를 지워서는 안 됨`.

The first proves the no-auth.uid human-finalization assertion is sensitive to removal of the intended guard, rather than merely seeing a permissions error. The second proves a caregiver session DELETE cascade cannot silently destroy a final journal; deleting that protection triggers the exact postcondition assertion. Parent's earlier fresh unmutated17-suite baseline is the green side of these experiments. results.json records assertion matching and before/after SHA256 equality for each repository migration. Both productFileUnchanged=true. Raw logs, temporary mutant SQL and copied runners are retained in this directory.

Reproduce from Windows cmd:

    powershell -NoProfile -ExecutionPolicy Bypass -File .tmp\whitebox-2026-10-25\db-mutants\run-db-mutants.ps1

The PowerShell source is UTF8 with BOM for Windows PowerShell5 compatibility. Raw child logs are written explicitly as UTF8.

SQL instrumentation limitations: this harness does not install/use a PL/pgSQL branch, function, statement or line coverage extension, so no numerical SQL execution coverage is available. static-inventory.json contains only text-derived inventory:84 migration files;144 anchored CREATE FUNCTION declarations;116 unique schema.function names (not an overload-aware/live function denominator);17 existing suites;576 line-anchored ASSERT statements (not test-case/path counts, because loops can evaluate assertions multiple times). Replaced/dropped/overloaded functions and dynamic SQL mean those counts cannot establish function execution coverage. Migration application proves SQL definitions parse and required schema/roles/triggers/policies install in the synthetic environment; it does not prove every function or error branch executes. Supabase Auth and Storage are local shims, JWT claims are injected using test.uid/test.role, and provider/network/cron integrations are unavailable or stubbed. The operating privilege differences are covered by prod_privileges.sql, while the two mutants establish only the specific guard sensitivities above. No100% SQL branches or all-path proof is claimed.
