import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      // `server-only` throws when imported outside a React Server Component;
      // in tests we stub it out so server-only modules can be imported.
      'server-only': path.resolve(__dirname, 'test/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
