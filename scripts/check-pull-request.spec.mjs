import { describe, expect, it } from 'vitest';
import { checkBranch, checkSize, checkSubject, countChangedLines } from './check-pull-request.mjs';

describe('pull request branch names', () => {
  it('accepts a typed branch with a task id', () => {
    expect(checkBranch('feat/acc-3-sessions')).toEqual([]);
    expect(checkBranch('chore/rev-9-ci-security-checks')).toEqual([]);
  });

  it('rejects an unknown type, upper case and empty words', () => {
    expect(checkBranch('feature/acc-3-sessions')).toHaveLength(1);
    expect(checkBranch('feat/ACC-3-sessions')).toHaveLength(1);
    expect(checkBranch('feat/acc--3')).toHaveLength(1);
    expect(checkBranch('patch-1')).toHaveLength(1);
  });

  it('rejects a branch over 50 characters', () => {
    const branch = `feat/${'a'.repeat(46)}`;
    expect(branch.length).toBe(51);
    expect(checkBranch(branch)).toEqual([expect.stringContaining('limit is 50')]);
    expect(checkBranch(`feat/${'a'.repeat(45)}`)).toEqual([]);
  });

  it('tells the author to rename a tool default branch', () => {
    expect(checkBranch('codex/fix-sessions')).toEqual([expect.stringContaining('Rename it')]);
  });
});

describe('pull request titles and commit subjects', () => {
  it('accepts the plain and scoped styles', () => {
    expect(checkSubject('Title', 'feat(acc-7): add staff roles')).toEqual([]);
    expect(checkSubject('Commit', 'fix: round order totals')).toEqual([]);
  });

  it('rejects an unknown type, a capital letter, a bad scope and a missing space', () => {
    expect(checkSubject('Title', 'ci(rev-9): split jobs')).toHaveLength(1);
    expect(checkSubject('Title', 'feat(acc-7): Add staff roles')).toHaveLength(1);
    expect(checkSubject('Title', 'feat(ACC-7): add staff roles')).toHaveLength(1);
    expect(checkSubject('Commit', 'feat:add staff roles')).toHaveLength(1);
    expect(checkSubject('Commit', 'Update ci.yml')).toEqual([
      'Commit "Update ci.yml" must look like "feat(acc-7): lower-case summary".',
    ]);
  });
});

describe('pull request size', () => {
  it('counts added and deleted lines outside the excluded paths', () => {
    const numstat = [
      '10\t5\tpackages/core/src/team/team.service.ts',
      '300\t200\tpnpm-lock.yaml',
      '40\t0\tdocs/tasks.md',
      '3\t1\tREADME.md',
      '50\t0\tpackages/core/src/team/team.service.spec.ts',
      '50\t0\tpackages/core/src/team/team.int.spec.ts',
      '20\t0\tapps/web/src/sign-in.spec.tsx',
      '20\t0\tpackages/core/test/store-fixture.ts',
      '20\t0\tapps/web/e2e/sign-in.ts',
      '90\t0\tpackages/db/migrations/meta/0007_snapshot.json',
      '30\t0\tpackages/db/migrations/0007_staff.sql',
      '7\t2\tpackages/db/src/schema/staff.ts',
      '-\t-\tapps/web/public/logo.png',
      '',
    ].join('\n');
    expect(countChangedLines(numstat)).toBe(24);
  });

  it('passes at 500, warns above 500 and fails above 800', () => {
    expect(checkSize(500, [])).toEqual({ errors: [], warnings: [] });
    expect(checkSize(501, []).warnings).toHaveLength(1);
    expect(checkSize(800, [])).toMatchObject({ errors: [] });
    expect(checkSize(801, []).errors).toHaveLength(1);
  });

  it('only warns above 800 for a mechanical change', () => {
    expect(checkSize(2000, ['mechanical-change'])).toMatchObject({ errors: [] });
    expect(checkSize(2000, ['mechanical-change']).warnings).toHaveLength(1);
  });
});
