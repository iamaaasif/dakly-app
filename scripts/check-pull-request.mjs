// Checks a pull request's branch name, title, commit subjects and size.
// See docs/rules/pull-requests.md. CI passes the values in the environment.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const types = 'feat|fix|refactor|perf|docs|test|chore';
const branchPattern = new RegExp(`^(${types})/[a-z0-9]+(-[a-z0-9]+)*$`);
const subjectPattern = new RegExp(`^(${types})(\\([a-z0-9-]+\\))?: [a-z].+`);
const maximumBranchLength = 50;
const warningLines = 500;
const failingLines = 800;
const mechanicalLabel = 'mechanical-change';
const uncountedPaths = [
  /^pnpm-lock\.yaml$/,
  /^docs\//,
  /\.md$/,
  // Also covers .int.spec.ts.
  /\.spec\.tsx?$/,
  /(^|\/)test\//,
  /^apps\/web\/e2e\//,
  /^packages\/db\/migrations\/meta\//,
  /^packages\/db\/migrations\/.*\.sql$/,
];

export function checkBranch(branch) {
  if (branch.startsWith('codex/'))
    return [
      `Branch "${branch}" uses a tool default name. Rename it to <type>/<task-id>-<what-it-does>.`,
    ];
  const errors = [];
  if (!branchPattern.test(branch))
    errors.push(
      `Branch "${branch}" must look like <type>/<task-id>-<what-it-does>, such as feat/acc-3-sessions.`,
    );
  if (branch.length > maximumBranchLength)
    errors.push(
      `Branch "${branch}" is ${branch.length} characters; the limit is ${maximumBranchLength}.`,
    );
  return errors;
}

export function checkSubject(kind, subject) {
  if (subjectPattern.test(subject)) return [];
  return [`${kind} "${subject}" must look like "feat(acc-7): lower-case summary".`];
}

export function countChangedLines(numstat) {
  let total = 0;
  for (const line of numstat.split('\n').filter(Boolean)) {
    const [added, deleted, path] = line.split('\t');
    if (uncountedPaths.some((pattern) => pattern.test(path))) continue;
    // Binary files show "-" instead of counts.
    total += (Number(added) || 0) + (Number(deleted) || 0);
  }
  return total;
}

export function checkSize(changedLines, labels) {
  const summary = `${changedLines} changed lines, not counting lock files, docs, tests and migrations`;
  if (changedLines > failingLines && !labels.includes(mechanicalLabel))
    return {
      errors: [`${summary}; the limit is ${failingLines}. Split the pull request.`],
      warnings: [],
    };
  if (changedLines > warningLines)
    return { errors: [], warnings: [`${summary}; aim for under ${warningLines}.`] };
  return { errors: [], warnings: [] };
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

function main() {
  const { BASE_SHA, HEAD_SHA, PR_TITLE, PR_BRANCH, PR_LABELS } = process.env;
  // Merge commits from updating the branch with main are not the author's subjects.
  const subjects = git('log', '--no-merges', '--format=%s', `${BASE_SHA}..${HEAD_SHA}`)
    .split('\n')
    .filter(Boolean);
  const changedLines = countChangedLines(
    git('diff', '--numstat', '--no-renames', `${BASE_SHA}...${HEAD_SHA}`),
  );
  const size = checkSize(changedLines, JSON.parse(PR_LABELS || '[]'));
  const errors = [
    ...checkBranch(PR_BRANCH),
    ...checkSubject('Title', PR_TITLE),
    ...subjects.flatMap((subject) => checkSubject('Commit', subject)),
    ...size.errors,
  ];
  for (const warning of size.warnings) console.log(`::warning::${warning}`);
  for (const error of errors) console.log(`::error::${error}`);
  console.log(`${changedLines} counted changed lines, ${subjects.length} commits checked.`);
  if (errors.length > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
