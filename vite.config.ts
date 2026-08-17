import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // .claude/worktrees/ sits inside the project root (for isolated
    // multi-agent work) and isn't excluded by Vitest's defaults, so without
    // this, `npm run test` from any one worktree also picks up and runs
    // every sibling worktree's test files — inflating results and making
    // it impossible to verify a single tree in isolation.
    exclude: ['**/node_modules/**', '**/.claude/**'],
  },
})
