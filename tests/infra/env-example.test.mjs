import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const source = readFileSync(`${repoRoot}.env.example`, 'utf8');
const values = Object.fromEntries(
  source
    .split('\n')
    .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    }),
);

describe('.env.example', () => {
  it('embeds no credentials in any connection URL', () => {
    for (const [key, value] of Object.entries(values)) {
      assert.doesNotMatch(value, /:\/\/[^\s/@]*:[^\s/@]+@/, `${key} carries inline credentials`);
    }
  });

  it('declares every variable docker-compose requires', () => {
    for (const key of ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB']) {
      assert.ok(values[key], `${key} is missing or empty — compose fails without it`);
    }
  });
});
