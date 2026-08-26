import type { Theme } from './types'

export const themeLocalStorageKey = 'payload-theme'

/**
 * Per ADR-0003 the ground is dark unless the visitor has said otherwise. The
 * operating system's `prefers-color-scheme` is deliberately not consulted:
 * resolution is stored preference, else this.
 */
export const defaultTheme: Theme = 'dark'
