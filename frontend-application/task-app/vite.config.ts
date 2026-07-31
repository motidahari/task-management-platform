import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // @core/shared ships CommonJS; pre-bundle the browser-safe entry points so
  // their named exports resolve through esbuild's interop instead of being
  // served as raw CJS. The bare barrel is deliberately excluded — it re-exports
  // NestJS-backed filters/exceptions that reference `process` and break in the
  // browser; the app only needs the error-code and error-response modules.
  optimizeDeps: {
    include: ['@core/shared/error-codes', '@core/shared/errors/error-response'],
  },
  build: { commonjsOptions: { include: [/@core\/shared/, /node_modules/] } },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    env: {
      VITE_API_URL: 'http://localhost:3000/api/v1',
    },
  },
});
