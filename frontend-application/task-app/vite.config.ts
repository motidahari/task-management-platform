import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // @core/shared ships CommonJS; pre-bundle it so its named exports resolve
  // through esbuild's interop instead of being served as raw CJS.
  optimizeDeps: { include: ['@core/shared'] },
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
