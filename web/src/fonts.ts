import { IBM_Plex_Mono, IBM_Plex_Sans, Manrope } from 'next/font/google'

/**
 * The brand book's three faces, three jobs: Manrope carries the voice, Plex
 * Sans does the reading, Plex Mono handles data, code and labels.
 *
 * Loaded through next/font, which self-hosts the files and inlines the
 * @font-face rules — no render-blocking request to a font CDN. Each carries an
 * explicit fallback stack so the page is legible before the webfont arrives.
 *
 * The option values have to be written as literals; next/font reads them at
 * build time and rejects anything it cannot see, including a shared constant.
 */
export const display = Manrope({
  display: 'swap',
  fallback: ['system-ui', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
  subsets: ['latin'],
  variable: '--font-manrope',
  weight: ['500', '700', '800'],
})

export const sans = IBM_Plex_Sans({
  display: 'swap',
  fallback: ['system-ui', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
  subsets: ['latin'],
  variable: '--font-plex-sans',
  weight: ['400', '500', '600'],
})

export const mono = IBM_Plex_Mono({
  display: 'swap',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
  subsets: ['latin'],
  variable: '--font-plex-mono',
  weight: ['400', '500', '600'],
})

export const fontVariables = [display.variable, sans.variable, mono.variable]
