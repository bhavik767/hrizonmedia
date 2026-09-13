'use client'

import { useNav } from '@payloadcms/ui'
import React from 'react'

const baseClass = 'nav'

/**
 * Re-implements @payloadcms/next's internal `NavWrapper` (it isn't part of that package's public
 * API, so it can't be imported directly): the slide-in/out `<aside>` shell driven by the shared
 * nav-open/animate state from Payload's `NavProvider`.
 */
export const NavWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { hydrated, navOpen, navRef, shouldAnimate } = useNav()

  const className = [
    baseClass,
    navOpen && `${baseClass}--nav-open`,
    shouldAnimate && `${baseClass}--nav-animate`,
    hydrated && `${baseClass}--nav-hydrated`,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <aside className={className} inert={!navOpen ? true : undefined}>
      <div className={`${baseClass}__scroll`} ref={navRef}>
        {children}
      </div>
    </aside>
  )
}
