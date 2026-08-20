import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.js', './server/tests/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}', 'server/**/*.{test,spec}.{js,jsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}', 'server/**/*.js'],
      exclude: [
        'src/tests/**',
        'src/data/**',
        'server/tests/**',
        'server/scripts/**'
      ],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        statements: 19,
        branches: 13,
        functions: 15,
        lines: 20,
        'server/security/**': {
          statements: 85,
          branches: 80,
          functions: 90,
          lines: 85
        },
        'server/schemas/**': {
          statements: 95,
          branches: 70,
          functions: 95,
          lines: 95
        }
      }
    },
  },
});
