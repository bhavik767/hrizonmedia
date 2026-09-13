import Link from 'next/link'
import React from 'react'

import { Logo } from '@/components/Logo/Logo'

export async function Footer() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer__inner">
        <Link aria-label="HrizonMedia home" className="footer-mark" href="/">
          <Logo compact />
        </Link>
        <div>
          <p className="site-footer__tagline">Plays where you allow it. Nowhere else.</p>
          <p className="site-footer__meta">&copy; {new Date().getFullYear()} HrizonMedia</p>
        </div>
      </div>
    </footer>
  )
}
