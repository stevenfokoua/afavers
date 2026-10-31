import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Match the app: workspace-root testing tools must use the client React version.
  resolve: { dedupe: ['react', 'react-dom', 'react-router-dom', 'react-router'] },
  plugins: [react()],
  define: {
    // The main vite.config defines __APP_VERSION__; mirror it here so
    // any service file that references it compiles without error.
    '__APP_VERSION__': JSON.stringify('test'),
  },
  test: {
    // Default environment for pure service/unit tests.
    // Individual test files can override with:
    //   // @vitest-environment jsdom
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/services/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  },
});
