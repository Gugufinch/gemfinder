import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: ['lib/gemfinder/scout/**', 'lib/gemfinder/scout-*.ts', 'app/api/ar/scout/**'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
      reporter: ['text', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
