import { defineConfig } from 'vite'

export default defineConfig({
  // Relative base so the build works at the GitHub Pages project path
  // (https://<user>.github.io/<repo>/) without hardcoding the repo name.
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 5173,
    open: true,
  },
})
