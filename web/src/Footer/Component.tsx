import Link from 'next/link'
import React from 'react'

import { Logo } from '@/components/Logo/Logo'

export async function Footer() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer__inner">
        <Link aria-label="WeCloud home" className="footer-mark" href="/">
          <Logo compact />
        </Link>
        <div>
          <p className="site-footer__tagline">Secure video, under your control.</p>
          <p className="site-footer__meta">
            &copy; WeCloud · <a href="https://wecloud.biz">wecloud.biz</a>
          </p>
        </div>
      </div>
    </footer>
  )
}
