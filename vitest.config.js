import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.js', './server/tests/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}', 'server/**/*.{test,spec}.{js,jsx}'],
  },
});
