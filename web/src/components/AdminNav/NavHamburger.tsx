'use client'

import { Hamburger, useNav } from '@payloadcms/ui'
import React from 'react'

const baseClass = 'nav'

/**
 * Re-implements @payloadcms/next's internal `NavHamburger` (it isn't part of that package's
 * public API, so it can't be imported directly): the mobile "close nav" button shown at the
 * bottom of the open nav panel.
 */
export const NavHamburgerButton: React.FC = () => {
  const { navOpen, setNavOpen } = useNav()

  return (
    <button
      className={`${baseClass}__mobile-close`}
      onClick={() => setNavOpen(false)}
      tabIndex={!navOpen ? -1 : undefined}
      type="button"
    >
      <Hamburger isActive />
    </button>
  )
}
