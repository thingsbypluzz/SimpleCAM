import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { Features } from 'lightningcss'

// Read at config-eval time (Node, not the browser) and inline as a define —
// avoids needing `resolveJsonModule` in tsconfig just for one string, and
// keeps package.json as the single source of truth for the version shown
// in Settings > About (see CLAUDE.md, BL-13).
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  css: {
    lightningcss: {
      // Colors with alpha stay `rgba()` / `transparent` in the built CSS.
      // The minifier would shorten them to 4- and 8-digit hex (`#0000`),
      // which an Android WebView rejects for apps that target an old SDK
      // (it keeps the legacy #AARRGGBB reading there) — every transparent
      // or translucent color then falls back to the browser's default.
      include: Features.HexAlphaColors,
    },
  },
  test: {
    // .claude/worktrees/ sits inside the project root (for isolated
    // multi-agent work) and isn't excluded by Vitest's defaults, so without
    // this, `npm run test` from any one worktree also picks up and runs
    // every sibling worktree's test files — inflating results and making
    // it impossible to verify a single tree in isolation.
    exclude: ['**/node_modules/**', '**/.claude/**'],
  },
})
