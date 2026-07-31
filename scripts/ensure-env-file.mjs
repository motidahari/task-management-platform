import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

/**
 * Copy `.env.example` to `target` when `target` does not already exist.
 * Returns true only when a file was created, so callers can report it.
 */
export function ensureEnvFile(root, target = '.env') {
  const envPath = join(root, target);
  if (existsSync(envPath)) {
    return false;
  }

  copyFileSync(join(root, '.env.example'), envPath);
  return true;
}

// The backend reads `.env`; Vite only loads `.env.local` for the SPA, so each
// consumer is seeded from its own example. Without the frontend copy the app
// boots with no VITE_API_URL and renders a config-error screen instead of the UI.
const ENV_TARGETS = [
  { root: repoRoot, target: '.env', createdMessage: 'Created .env from .env.example.' },
  {
    root: join(repoRoot, 'frontend-application/task-app'),
    target: '.env.local',
    createdMessage: 'Created frontend-application/task-app/.env.local from .env.example.',
  },
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const { root, target, createdMessage } of ENV_TARGETS) {
    if (ensureEnvFile(root, target)) {
      process.stdout.write(`${createdMessage} Review its values before deploying.\n`);
    }
  }
}
