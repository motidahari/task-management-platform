/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  // With DB_URL set, the integration and API suites all write to that one
  // database and each restores what it wrote. They cannot run concurrently:
  // the ledger attributes a write by the connection that made it, and every
  // worker writes over an identically marked pool. Without DB_URL those suites
  // skip entirely and there is nothing to serialize, so the key stays off the
  // config altogether and unit-only runs keep full parallelism.
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
