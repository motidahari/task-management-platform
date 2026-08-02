#!/usr/bin/env node

/**
 * Runs the database-backed suites — `tests/integration/` and `tests/api/` — and
 * fails when they did not actually execute.
 *
 * Those suites gate their `describe` on `DB_URL` / `REDIS_URL` and skip cleanly
 * when neither is configured, which is right for a local unit-only run and
 * useless as a guarantee: a runner with no database reachable exits 0 having
 * verified nothing. So the exit code alone is not the verdict here. Every spec
 * file the globs match must be executed, none of its tests may come back
 * pending, and at least one must have passed.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serviceRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * `jest` publishes no importable path to its own CLI, and npm hoists the
 * install to whichever ancestor holds the workspace root, so the executable is
 * found by walking up rather than resolved.
 */
function findJestBin() {
  let directory = serviceRoot;
  for (;;) {
    const candidate = path.join(directory, 'node_modules', 'jest', 'bin', 'jest.js');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error('jest is not installed — run npm install first');
    }
    directory = parent;
  }
}

const jestBin = findJestBin();

const TEST_PATH_PATTERNS = 'tests/(integration|api)/';
const forwardedArgs = process.argv.slice(2);

function runJest(args, options = {}) {
  return spawnSync(process.execPath, [jestBin, '--testPathPatterns', TEST_PATH_PATTERNS, ...args], {
    cwd: serviceRoot,
    stdio: options.stdio ?? 'inherit',
    encoding: 'utf8',
  });
}

function fail(message) {
  process.stderr.write(`\nDatabase-backed suites did not run: ${message}\n`);
  process.exit(1);
}

const listing = runJest(['--listTests', '--json'], { stdio: ['inherit', 'pipe', 'inherit'] });
if (listing.status !== 0) {
  fail('jest could not list the integration and API specs');
}

const expectedSuites = JSON.parse(listing.stdout).length;
if (expectedSuites === 0) {
  fail(`no spec file matches ${TEST_PATH_PATTERNS}`);
}

const reportDirectory = mkdtempSync(path.join(tmpdir(), 'task-service-integration-'));
const reportFile = path.join(reportDirectory, 'summary.json');

const run = runJest(['--json', `--outputFile=${reportFile}`, ...forwardedArgs]);

let summary;
try {
  summary = JSON.parse(readFileSync(reportFile, 'utf8'));
} catch {
  fail('jest produced no run summary — the suites never started');
} finally {
  rmSync(reportDirectory, { recursive: true, force: true });
}

const {
  numTotalTestSuites = 0,
  numRuntimeErrorTestSuites = 0,
  numPassedTests = 0,
  numPendingTests = 0,
  numTodoTests = 0,
} = summary;

process.stdout.write(
  `\nExecuted ${numTotalTestSuites}/${expectedSuites} database-backed suites — ` +
    `${numPassedTests} passed, ${numPendingTests} pending, ${numTodoTests} todo.\n`,
);

if (numRuntimeErrorTestSuites > 0) {
  fail(`${numRuntimeErrorTestSuites} suite(s) failed to load`);
}
if (numTotalTestSuites !== expectedSuites) {
  fail(`only ${numTotalTestSuites} of ${expectedSuites} suites were executed`);
}
if (numPendingTests > 0 || numTodoTests > 0) {
  fail(
    `${numPendingTests + numTodoTests} test(s) were skipped — ` +
      'DB_URL and REDIS_URL must point at a reachable database and cache',
  );
}
if (numPassedTests === 0) {
  fail('not a single test passed');
}

process.exit(run.status ?? 1);
