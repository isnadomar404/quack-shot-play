import { defineConfig } from "vite";

// Duck Hunt remake — dev/build config.
// Keep this minimal; no plugins unless a phase needs one (ask first per CLAUDE.md).
export default defineConfig({
  // Relative asset paths so the built site deploys to any static host, including
  // a sub-path (GitHub Pages project page, itch.io, etc.) without a rewrite.
  base: "./",
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: "es2022",
    outDir: "dist",
    assetsInlineLimit: 0, // never inline sprites; keep them as discrete files
  },
});
