import { execSync } from 'node:child_process'
import { defineConfig, type Plugin } from 'vite'

/**
 * The build's identity: the commit it was made from, or a timestamp when git
 * is not available. Everything cache-related keys off this one string.
 */
function buildId(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return `t${Date.now().toString(36)}`
  }
}

const BUILD_ID = buildId()

/**
 * GitHub Pages serves whatever it likes for Cache-Control and gives us no way
 * to change it — there is no _headers file, no .htaccess, no config. So the
 * page cannot be *told* not to cache; it has to notice for itself.
 *
 * This emits a tiny version.json beside the bundle. index.html fetches it with
 * `cache: 'no-store'` on boot and compares it to the id baked into the HTML.
 * A mismatch means the browser is running a stale index.html, which on Pages
 * is not merely out of date but broken: the hashed bundle it points at no
 * longer exists, so the game would not boot at all. One guarded reload fixes
 * it, and the guard stops it looping if the reload is served from cache too.
 */
function versionStamp(): Plugin {
  return {
    name: 'courjahan-version-stamp',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ build: BUILD_ID, at: new Date().toISOString() }, null, 2),
      })
    },
    transformIndexHtml(html) {
      return html.replace(/__BUILD_ID__/g, BUILD_ID)
    },
  }
}

export default defineConfig({
  // Relative base so the build works at the GitHub Pages project path
  // (https://<user>.github.io/<repo>/) without hardcoding the repo name.
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [versionStamp()],
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Content-hashed, so a changed bundle is a new URL and no cache can
        // hand back the old one. Vite does this by default; it is spelled out
        // because it is the mechanism the whole fix rests on.
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
})
