/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  // With DB_URL set, the integration and API suites share one database and the
  // seeded rows in it — they page over the same users and assign tasks to them,
  // which two suites doing it at once would read differently. Attribution is
  // not the reason: the ledger scopes that per run, so parallel runs of this
  // config against one database are already safe from each other. Without
  // DB_URL those suites skip entirely and there is nothing to serialize, so the
  // key stays off the config and unit-only runs keep full parallelism.
  ...(process.env.DB_URL ? { maxWorkers: 1 } : {}),
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/main.ts',
    '!<rootDir>/src/**/*.entity.ts',
    '!<rootDir>/src/migrations/**',
  ],
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 80,
    },
  },
};
