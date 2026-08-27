'use client'

import React, { createContext, useCallback, use, useEffect, useState } from 'react'

import type { Theme, ThemeContextType } from './types'

import canUseDOM from '@/utilities/canUseDOM'
import { defaultTheme, themeLocalStorageKey } from './shared'
import { themeIsValid } from './types'

const initialContext: ThemeContextType = {
  setTheme: () => null,
  theme: undefined,
}

const ThemeContext = createContext(initialContext)

/**
 * Resolution is stored preference, else `defaultTheme`, matching the inline
 * script in `InitTheme`. The operating system's preference is deliberately
 * ignored — see ADR-0003.
 */
const resolveTheme = (): Theme => {
  const preference = window.localStorage.getItem(themeLocalStorageKey)

  return themeIsValid(preference) ? preference : defaultTheme
}

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setThemeState] = useState<Theme | undefined>(
    canUseDOM ? (document.documentElement.getAttribute('data-theme') as Theme) : undefined,
  )

  const setTheme = useCallback((themeToSet: Theme | null) => {
    if (themeToSet === null) {
      window.localStorage.removeItem(themeLocalStorageKey)
    } else {
      window.localStorage.setItem(themeLocalStorageKey, themeToSet)
    }

    const resolved = resolveTheme()
    document.documentElement.setAttribute('data-theme', resolved)
    setThemeState(resolved)
  }, [])

  useEffect(() => {
    const resolved = resolveTheme()

    document.documentElement.setAttribute('data-theme', resolved)
    setThemeState(resolved)
  }, [])

  return <ThemeContext value={{ setTheme, theme }}>{children}</ThemeContext>
}

export const useTheme = (): ThemeContextType => use(ThemeContext)
