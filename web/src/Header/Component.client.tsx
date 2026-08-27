'use client'
import { useHeaderTheme } from '@/providers/HeaderTheme'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React, { useEffect, useState } from 'react'

import type { Header } from '@/payload-types'

import { Logo } from '@/components/Logo/Logo'
import { ThemeSelector } from '@/providers/Theme/ThemeSelector'
import { HeaderNav, HeaderSearch } from './Nav'

interface HeaderClientProps {
  data: Header
}

/**
 * The header wraps every page and carries no promotional bar above it and no
 * call to action inside it. Both omissions are load-bearing rather than
 * unfinished work — see the brand book's one-primary-per-view rule.
 *
 * The layout wraps instead of collapsing behind a menu button. With three short
 * category links there is nothing worth hiding, and a disclosure would put the
 * site's navigation behind JavaScript for no gain.
 */
export const HeaderClient: React.FC<HeaderClientProps> = ({ data }) => {
  /* Storing the value in a useState to avoid hydration errors */
  const [theme, setTheme] = useState<string | null>(null)
  const { headerTheme, setHeaderTheme } = useHeaderTheme()
  const pathname = usePathname()

  useEffect(() => {
    setHeaderTheme(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  useEffect(() => {
    if (headerTheme && headerTheme !== theme) setTheme(headerTheme)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerTheme])

  return (
    <header
      className="relative z-20 border-b border-border bg-background"
      {...(theme ? { 'data-theme': theme } : {})}
    >
      <div className="container flex flex-wrap items-center gap-x-8 gap-y-3 py-4">
        <Link className="shrink-0" href="/">
          <Logo loading="eager" priority="high" />
        </Link>

        <HeaderNav data={data} />

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <HeaderSearch />
          <ThemeSelector />
        </div>
      </div>
    </header>
  )
}
