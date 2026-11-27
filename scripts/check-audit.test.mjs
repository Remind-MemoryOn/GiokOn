import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const gate = fileURLToPath(new URL('./check-audit.mjs', import.meta.url));
function runAudit(stdout, status = 0) {
  const directory = mkdtempSync(path.join(tmpdir(), 'giokon audit '));
  try {
    writeFileSync(path.join(directory, 'report.json'), stdout);
    writeFileSync(path.join(directory, 'audit.cjs'), `
      process.stdout.write(require('node:fs').readFileSync(require('node:path').join(__dirname, 'report.json')));
      process.exit(${status});
    `);
    writeFileSync(path.join(directory, process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'),
      process.platform === 'win32'
        ? `@echo off\r\n"${process.execPath}" "%~dp0audit.cjs"\r\n`
        : `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' "$(dirname "$0")/audit.cjs"\n`,
      { mode: 0o755 });
    return spawnSync(process.execPath, [gate], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${directory}${path.delimiter}${process.env.PATH}` },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('runs the package manager and accepts a valid empty audit', () => {
  const result = runAudit(JSON.stringify({ advisories: {}, metadata: {} }));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /high\/critical/);
});

test('blocks a web high advisory even when audit exits nonzero', () => {
  const result = runAudit(JSON.stringify({ advisories: {
    example: { severity: 'high', module_name: 'fixture', findings: [{ paths: ['apps__web>fixture'] }] },
  } }), 1);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /fixture/);
});

test('reports build-only and dev-dependency app advisories without blocking', () => {
  for (const path of ['apps__mobile>expo>@expo/cli>node-forge', 'apps__mobile>expo>@expo/metro>metro>image-size', 'apps__mobile>vitest>tinypool']) {
    const result = runAudit(JSON.stringify({ advisories: {
      example: { severity: 'critical', module_name: 'fixture', findings: [{ paths: [path] }] },
    } }), 1);
    assert.equal(result.status, 0, `${path}: ${result.stderr}`);
    assert.match(result.stdout, /fixture/);
  }
});

test('blocks an app advisory that reaches the app bundle (store submission, 2026-11-27)', () => {
  for (const path of ['apps__mobile>expo-router>query-string>fixture', 'apps__mobile>fixture', 'apps__mobile>expo>fixture']) {
    const result = runAudit(JSON.stringify({ advisories: {
      example: { severity: 'high', module_name: 'fixture', findings: [{ paths: ['apps__mobile>expo>@expo/cli>fixture', path] }] },
    } }), 1);
    assert.equal(result.status, 1, `${path}: ${result.stdout}`);
    assert.match(result.stderr, new RegExp(path.replaceAll('>', '\\>')));
  }
});

test('does not treat a lookalike dev-dependency name as build-only', () => {
  const result = runAudit(JSON.stringify({ advisories: {
    example: { severity: 'high', module_name: 'fixture', findings: [{ paths: ['apps__mobile>vitest-runtime-lookalike>fixture'] }] },
  } }), 1);
  assert.equal(result.status, 1, result.stdout);
});

test('fails closed on an empty or invalid audit response', () => {
  for (const stdout of ['', 'registry unavailable', JSON.stringify({ error: { code: 'REGISTRY_UNAVAILABLE' } })]) {
    const result = runAudit(stdout, 1);
    assert.equal(result.status, 2);
  }
});
