import React from 'react'

import { defaultTheme, themeLocalStorageKey } from '../shared'

/**
 * Resolves the theme before first paint: stored preference, else the default.
 *
 * The operating system's `prefers-color-scheme` is not consulted. ADR-0003
 * records why — with an OS branch in the chain the configured default is dead
 * code, because the OS signal is always present, and a visitor on a light-mode
 * machine would never see the brand's dark ground.
 *
 * This is a plain inline script rather than `next/script` with
 * `beforeInteractive`, which defers execution to the Next client runtime and so
 * resolves the theme only after hydration has begun. A flash of the wrong
 * theme is a defect, so the resolution has to block parsing here in the head.
 */
export const InitTheme: React.FC = () => {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var p=window.localStorage.getItem('${themeLocalStorageKey}');document.documentElement.setAttribute('data-theme',p==='light'||p==='dark'?p:'${defaultTheme}')}catch(e){document.documentElement.setAttribute('data-theme','${defaultTheme}')}})()`,
      }}
      id="theme-script"
    />
  )
}
