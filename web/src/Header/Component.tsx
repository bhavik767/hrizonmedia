import { Logo } from '@/components/Logo/Logo'
import Link from 'next/link'
import React from 'react'

export async function Header() {
  const demoEnabled = process.env.HRIZONMEDIA_DEMO_ENABLED === 'true'

  return (
    <header className="site-header">
      <div className="shell site-header__inner">
        <Link aria-label="WeCloud home" className="home-link" href="/">
          <Logo />
        </Link>
        {demoEnabled && (
          <Link aria-label="Sign in to WeCloud Dashboard" className="primary-action" href="/demo">
            Sign in
            <svg aria-hidden="true" className="action-arrow" viewBox="0 0 16 16">
              <path d="M3 13 13 3M6 3h7v7" />
            </svg>
          </Link>
        )}
      </div>
    </header>
  )
}
