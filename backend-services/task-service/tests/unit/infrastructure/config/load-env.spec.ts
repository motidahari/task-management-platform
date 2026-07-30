import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadEnvFile } from '../../../../src/infrastructure/config/load-env';

const PROBE_KEY = 'LOAD_ENV_SPEC_PROBE';
const NESTED_KEY = 'LOAD_ENV_SPEC_NESTED';

describe('loadEnvFile', () => {
  let tempRoot: string;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'load-env-'));
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    delete process.env[PROBE_KEY];
    delete process.env[NESTED_KEY];
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('Given:a .env two directories above the start directory', () => {
    it('should ascend to it and populate process.env', () => {
      writeFileSync(join(tempRoot, '.env'), `${PROBE_KEY}=from-root\n`);
      const startDir = join(tempRoot, 'backend-services', 'task-service');
      mkdirSync(startDir, { recursive: true });
      process.env.NODE_ENV = 'development';

      loadEnvFile(startDir);

      expect(process.env[PROBE_KEY]).toBe('from-root');
    });
  });

  describe('Given:a .env in the start directory itself', () => {
    it('should load it without ascending', () => {
      writeFileSync(join(tempRoot, '.env'), `${NESTED_KEY}=here\n`);
      process.env.NODE_ENV = 'development';

      loadEnvFile(tempRoot);

      expect(process.env[NESTED_KEY]).toBe('here');
    });
  });

  describe('Given:no .env anywhere up to the filesystem root', () => {
    it('should leave the environment untouched and not throw', () => {
      const startDir = join(tempRoot, 'a', 'b');
      mkdirSync(startDir, { recursive: true });
      process.env.NODE_ENV = 'development';

      expect(() => loadEnvFile(startDir)).not.toThrow();
      expect(process.env[PROBE_KEY]).toBeUndefined();
    });
  });

  describe('Given:NODE_ENV is production', () => {
    it('should skip loading even when a .env is present', () => {
      writeFileSync(join(tempRoot, '.env'), `${PROBE_KEY}=should-not-load\n`);
      process.env.NODE_ENV = 'production';

      loadEnvFile(tempRoot);

      expect(process.env[PROBE_KEY]).toBeUndefined();
    });
  });

  describe('Given:a variable already set in the environment', () => {
    it('should not overwrite it from the file', () => {
      writeFileSync(join(tempRoot, '.env'), `${PROBE_KEY}=from-file\n`);
      process.env.NODE_ENV = 'development';
      process.env[PROBE_KEY] = 'from-shell';

      loadEnvFile(tempRoot);

      expect(process.env[PROBE_KEY]).toBe('from-shell');
    });
  });
});
