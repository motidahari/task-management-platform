import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { ensureEnvFile } from '../../scripts/ensure-env-file.mjs';

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ensure-env-'));
  writeFileSync(join(root, '.env.example'), 'POSTGRES_PASSWORD=change-me\n');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('ensureEnvFile', () => {
  it('creates .env from the example when it is missing', () => {
    const created = ensureEnvFile(root);

    assert.equal(created, true);
    assert.equal(readFileSync(join(root, '.env'), 'utf8'), 'POSTGRES_PASSWORD=change-me\n');
  });

  it('never overwrites an existing .env', () => {
    writeFileSync(join(root, '.env'), 'POSTGRES_PASSWORD=mine\n');

    const created = ensureEnvFile(root);

    assert.equal(created, false);
    assert.equal(readFileSync(join(root, '.env'), 'utf8'), 'POSTGRES_PASSWORD=mine\n');
  });

  it('creates a custom target file (e.g. .env.local) from the example', () => {
    const created = ensureEnvFile(root, '.env.local');

    assert.equal(created, true);
    assert.equal(readFileSync(join(root, '.env.local'), 'utf8'), 'POSTGRES_PASSWORD=change-me\n');
  });
});
