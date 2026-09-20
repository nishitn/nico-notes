import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: {
    ignorePatterns: ['**/_generated/**', '**/dist/**'],
    plugins: ['typescript', 'react'],
  },
  fmt: { ignorePatterns: ['**/_generated/**', 'pnpm-lock.yaml'], singleQuote: true },
  test: {
    include: ['packages/**/*.test.ts'],
    server: { deps: { inline: ['convex-test'] } },
  },
});
