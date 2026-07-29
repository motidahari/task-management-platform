import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

export function ensureEnvFile(root) {
  const envPath = join(root, '.env');
  if (existsSync(envPath)) {
    return false;
  }

  copyFileSync(join(root, '.env.example'), envPath);
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (ensureEnvFile(repoRoot)) {
    process.stdout.write('Created .env from .env.example — review its values before deploying.\n');
  }
}
