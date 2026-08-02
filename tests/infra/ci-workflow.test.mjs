import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const workflow = parse(readFileSync(`${repoRoot}.github/workflows/ci.yml`, 'utf8'));
const taskService = JSON.parse(
  readFileSync(`${repoRoot}backend-services/task-service/package.json`, 'utf8'),
);

const integration = workflow.jobs.integration;
const runCommands = integration.steps.filter((step) => step.run).map((step) => step.run);

describe('CI workflow', () => {
  describe('integration job', () => {
    it('provides the postgres and redis containers the suites connect to', () => {
      assert.match(integration.services.postgres.image, /^postgres:15/);
      assert.match(integration.services.redis.image, /^redis:7/);
    });

    it('points the suites at those containers', () => {
      assert.match(integration.env.DB_URL, /@localhost:5432\//);
      assert.match(integration.env.REDIS_URL, /\/\/localhost:6379/);
    });

    it('runs the database-backed suites by name', () => {
      assert.ok(
        runCommands.some((command) =>
          /npm run test:integration\s+-w\s+backend-services\/task-service/.test(command),
        ),
        'the integration job never invokes the task-service test:integration script',
      );
    });

    it('never discovers that script optionally — a missing one must break the job', () => {
      for (const command of runCommands) {
        assert.doesNotMatch(command, /--if-present/);
      }
    });
  });

  describe('task-service', () => {
    it('ships the test:integration script the workflow calls', () => {
      assert.ok(
        taskService.scripts['test:integration'],
        'task-service declares no test:integration script — the CI job would run nothing',
      );
    });

    it('points that script at a runner that exists', () => {
      const [, scriptPath] = taskService.scripts['test:integration'].split(/\s+/);
      assert.ok(existsSync(`${repoRoot}backend-services/task-service/${scriptPath}`));
    });
  });
});
