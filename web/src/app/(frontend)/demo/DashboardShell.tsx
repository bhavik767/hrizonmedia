'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const navigation = [
  { href: '/demo', label: 'Dashboard' },
  { href: '/demo/videos', label: 'Video' },
  { href: '/demo/live', label: 'Live' },
  { href: '/demo/storage', label: 'Storage' },
  { href: '/demo/cdn', label: 'CDN' },
  { href: '/demo/account', label: 'Account' },
  { href: '/demo/integrations', label: 'Integrations' },
  { href: '/demo/support', label: 'Support' },
]

export function DashboardShell({
  children,
  currentPath,
}: {
  children: React.ReactNode
  currentPath: string
}) {
  const [navigationOpen, setNavigationOpen] = useState(false)

  useEffect(() => {
    setNavigationOpen(window.matchMedia('(min-width: 801px)').matches)
  }, [])

  return (
    <div className={`dashboard-shell${navigationOpen ? ' dashboard-shell--navigation-open' : ''}`}>
      <aside className="dashboard-sidebar">
        <Link className="dashboard-sidebar__brand" href="/demo">
          <span aria-hidden="true" className="dashboard-sidebar__mark">
            W
          </span>
          <span>WeCloud</span>
        </Link>
        <nav aria-label="Dashboard navigation" id="dashboard-navigation">
          <ul>
            {navigation.map(({ href, label }) => (
              <li key={href}>
                <Link aria-current={currentPath === href ? 'page' : undefined} href={href}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="dashboard-shell__main">
        <header className="dashboard-topbar">
          <button
            aria-controls="dashboard-navigation"
            aria-expanded={navigationOpen}
            aria-label={navigationOpen ? 'Close navigation' : 'Open navigation'}
            className="dashboard-menu-button"
            onClick={() => setNavigationOpen((open) => !open)}
            type="button"
          >
            <span aria-hidden="true">☰</span>
          </button>
          <p>Secure video, precisely controlled.</p>
        </header>
        {children}
      </div>
    </div>
  )
}
