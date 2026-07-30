import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

import { config as loadDotenv } from 'dotenv';

/**
 * Ascends from `startDir` to the filesystem root, returning the first
 * directory that contains a `.env` file. The monorepo keeps a single `.env`
 * at its root (Docker Compose and `npm run setup` both target it), yet host
 * dev launches this service from its own package directory two levels down —
 * so the file has to be searched for upward rather than assumed alongside the
 * process's working directory.
 */
function findEnvFile(startDir: string): string | undefined {
  let current = startDir;
  const { root } = parse(current);

  while (true) {
    const candidate = join(current, '.env');
    if (existsSync(candidate)) {
      return candidate;
    }

    if (current === root) {
      return undefined;
    }

    current = dirname(current);
  }
}

/**
 * Populates `process.env` from the repository's root `.env` for host-run
 * development, where nothing else injects it. In production and inside the
 * containers the orchestrator supplies the environment directly, so loading a
 * dev file there would only risk shadowing real values — hence the guard.
 *
 * dotenv never overwrites variables already present, so an explicitly exported
 * shell value still wins over the file.
 */
export function loadEnvFile(startDir: string = process.cwd()): void {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const envPath = findEnvFile(startDir);
  if (envPath) {
    loadDotenv({ path: envPath, quiet: true });
  }
}
