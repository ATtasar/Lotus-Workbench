import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
describe.skipIf(process.platform !== 'win32')('Windows deployment safety', () => {
  it('parses every deployment script with Windows PowerShell 5.1', () => {
    const result = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        resolve('test/windows-helpers.ps1'),
        '-Project',
        resolve('..'),
        '-ParseOnly',
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    expect(result).toContain('PASS');
  });
  it('rejects unsafe paths, external databases, foreign services and stale health results', () => {
    const artifacts = resolve('../artifacts');
    mkdirSync(artifacts, { recursive: true });
    const result = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        resolve('test/windows-helpers.ps1'),
        '-Project',
        resolve('..'),
        '-Scratch',
        mkdtempSync(resolve(artifacts, 'deploy-helpers-')),
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    expect(result).toContain('PASS: 16 deployment helper assertions');
  });
  it('reuses existing service registrations and restores environment after a failed switch', () => {
    const artifacts = resolve('../artifacts');
    mkdirSync(artifacts, { recursive: true });
    const result = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        resolve('test/windows-scenarios.ps1'),
        '-Project',
        resolve('..'),
        '-Scratch',
        mkdtempSync(resolve(artifacts, 'deploy-scenarios-')),
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    expect(result).toContain('PASS: repeated registration and failed release rollback');
  });
});
