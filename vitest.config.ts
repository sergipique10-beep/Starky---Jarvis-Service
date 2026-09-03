import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['vitest.setup.ts'],
    // Exclude nested git worktrees (e.g. .claude/worktrees/*) so running the
    // suite from the main checkout never picks up another workspace's tests.
    exclude: ['**/node_modules/**', '**/.claude/worktrees/**', '**/.worktrees/**'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
