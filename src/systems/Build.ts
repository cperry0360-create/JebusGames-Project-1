/**
 * Which build this is.
 *
 * Vite replaces `__BUILD_ID__` at build time with the commit the bundle was
 * made from. Everything that loads a file at runtime stamps this onto the URL,
 * because those files live in `public/` and Vite copies them verbatim — they
 * get no content hash of their own, so without a stamp a phone keeps last
 * week's art and last week's audio for as long as its cache feels like it.
 *
 * In `vite dev` the define is absent and this falls back to 'dev', which is
 * also a fine cache key: the dev server never caches anyway.
 */

declare const __BUILD_ID__: string | undefined

export const BUILD_ID: string =
  typeof __BUILD_ID__ === 'string' && __BUILD_ID__.length > 0 ? __BUILD_ID__ : 'dev'

/** Appends the build stamp to a runtime asset URL. */
export function stamped(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD_ID)}`
}
