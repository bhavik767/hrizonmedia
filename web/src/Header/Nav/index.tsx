'use client'

import React from 'react'

import type { Header as HeaderType } from '@/payload-types'

import { CMSLink } from '@/components/Link'
import Link from 'next/link'
import { SearchIcon } from 'lucide-react'

/**
 * The categories a reader can browse, and nothing else. There is deliberately
 * no call to action here: the email capture on the Article page is the single
 * primary action on the site, and a second yellow button in the chrome would
 * compete with it for the same decision.
 */
export const HeaderNav: React.FC<{ data: HeaderType }> = ({ data }) => {
  const navItems = data?.navItems || []

  return (
    <nav
      aria-label="Categories"
      className="order-last w-full overflow-x-auto md:order-none md:ml-auto md:w-auto"
    >
      <ul className="flex items-center gap-6 whitespace-nowrap pb-1 md:pb-0">
        {navItems.map(({ link }, i) => (
          <li key={i}>
            <CMSLink
              {...link}
              className="text-sm text-foreground no-underline hover:text-heading"
            />
          </li>
        ))}
      </ul>
    </nav>
  )
}

export const HeaderSearch: React.FC = () => (
  <Link
    aria-label="Search"
    className="inline-flex size-9 items-center justify-center rounded-pill text-foreground hover:bg-secondary hover:text-heading"
    href="/search"
  >
    <SearchIcon aria-hidden="true" className="w-5" />
  </Link>
)
