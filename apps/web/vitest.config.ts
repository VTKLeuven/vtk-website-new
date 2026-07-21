import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      'server-only': path.resolve(__dirname, 'test/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    env: {
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['lib/ticketing/{crypto,money,time,authorization}.ts'],
    },
  },
});
