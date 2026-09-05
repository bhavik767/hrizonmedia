import { getCachedGlobal } from '@/utilities/getGlobals'
import Link from 'next/link'
import React from 'react'

import { CMSLink } from '@/components/Link'
import { EmailCapture } from '@/components/EmailCapture'
import { Logo } from '@/components/Logo/Logo'

/**
 * A panel sitting on the page ground, separated by a hairline rather than a
 * shadow. It repeats the categories, carries the second email capture, and
 * closes on the legal line. The theme toggle is not here — it appears once, in
 * the header.
 */
export async function Footer() {
  const footerData = await getCachedGlobal('footer', 1)()

  const navItems = footerData?.navItems || []
  const legalItems = footerData?.legalItems || []

  return (
    <footer className="mt-auto border-t border-border bg-card">
      <div className="container py-12">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="flex flex-col gap-6">
            <Link className="w-fit" href="/">
              <Logo kind="mark" />
            </Link>

            <nav aria-label="Categories">
              <ul className="flex flex-col gap-3">
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
          </div>

          <EmailCapture className="md:w-[22rem]" />
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-border pt-6 text-sm text-caption md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} hrizonmedia</p>

          {legalItems.length > 0 && (
            <nav aria-label="Legal">
              <ul className="flex gap-6">
                {legalItems.map(({ link }, i) => (
                  <li key={i}>
                    <CMSLink {...link} className="text-caption no-underline hover:text-heading" />
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </div>
    </footer>
  )
}
