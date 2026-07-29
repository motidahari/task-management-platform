import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const compose = parse(readFileSync(`${repoRoot}docker-compose.yml`, 'utf8'));
const service = (name) => {
  const found = compose.services?.[name];
  assert.ok(found, `service "${name}" is missing from docker-compose.yml`);
  return found;
};

describe('docker-compose', () => {
  describe('services', () => {
    it('defines postgres, redis, migrate, backend and frontend', () => {
      assert.deepEqual(Object.keys(compose.services).sort(), [
        'backend',
        'frontend',
        'migrate',
        'postgres',
        'redis',
      ]);
    });

    it('points every build at a Dockerfile that exists', () => {
      const built = Object.values(compose.services).filter((definition) => definition.build);
      assert.equal(built.length, 3);
      for (const { build } of built) {
        assert.ok(existsSync(`${repoRoot}${build.dockerfile}`), `missing ${build.dockerfile}`);
      }
    });
  });

  describe('postgres', () => {
    it('pins postgres 15', () => {
      assert.match(service('postgres').image, /^postgres:15/);
    });

    it('has a readiness healthcheck', () => {
      assert.match(JSON.stringify(service('postgres').healthcheck.test), /pg_isready/);
    });

    it('lets the host port be overridden when 5432 is taken', () => {
      assert.match(service('postgres').ports[0], /^\$\{POSTGRES_PORT:-5432\}:5432$/);
    });

    it('persists data on a named volume', () => {
      const mounts = service('postgres').volumes.map((mount) => mount.split(':')[0]);
      assert.ok(mounts.some((name) => name in compose.volumes));
    });
  });

  describe('redis', () => {
    it('pins redis 7', () => {
      assert.match(service('redis').image, /^redis:7/);
    });

    it('has a readiness healthcheck', () => {
      assert.match(JSON.stringify(service('redis').healthcheck.test), /ping/i);
    });

    it('lets the host port be overridden when 6379 is taken', () => {
      assert.match(service('redis').ports[0], /^\$\{REDIS_PORT:-6379\}:6379$/);
    });
  });

  describe('migrate', () => {
    it('runs the same image as the backend, so schema and code never diverge', () => {
      assert.equal(service('migrate').image, service('backend').image);
      assert.ok(service('migrate').image);
    });

    it('runs the migration script', () => {
      assert.match(JSON.stringify(service('migrate').command), /migration:run/);
    });

    it('exits instead of restarting', () => {
      assert.equal(service('migrate').restart, 'no');
    });

    it('waits for a healthy database', () => {
      assert.equal(service('migrate').depends_on.postgres.condition, 'service_healthy');
    });
  });

  describe('backend', () => {
    it('starts only after migrations completed successfully', () => {
      assert.equal(
        service('backend').depends_on.migrate.condition,
        'service_completed_successfully',
      );
    });

    it('waits for healthy postgres and redis', () => {
      const dependsOn = service('backend').depends_on;
      assert.equal(dependsOn.postgres.condition, 'service_healthy');
      assert.equal(dependsOn.redis.condition, 'service_healthy');
    });

    it('has a healthcheck hitting the liveness endpoint', () => {
      assert.match(JSON.stringify(service('backend').healthcheck.test), /\/health/);
    });

    it('reaches postgres and redis over the compose network, not localhost', () => {
      const { DB_URL, REDIS_URL } = service('backend').environment;
      assert.match(DB_URL, /@postgres:5432\//);
      assert.match(REDIS_URL, /\/\/redis:6379/);
    });

    it('never allows a wildcard CORS origin', () => {
      assert.doesNotMatch(service('backend').environment.CORS_ORIGINS, /\*/);
    });
  });

  describe('frontend', () => {
    it('waits for a healthy backend', () => {
      assert.equal(service('frontend').depends_on.backend.condition, 'service_healthy');
    });

    it('has a healthcheck', () => {
      assert.ok(service('frontend').healthcheck.test);
    });

    it('is published on the port the backend allows as a CORS origin', () => {
      const [publishedPort] = service('frontend').ports[0].split(':');
      assert.ok(service('backend').environment.CORS_ORIGINS.includes(`:${publishedPort}`));
    });
  });
});
