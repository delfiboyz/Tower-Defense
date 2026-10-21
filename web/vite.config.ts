import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works on GitHub Pages and any sub-path.
  base: './',
  build: { target: 'es2022' },
  test: { environment: 'node' },
});
