import type { Metadata } from 'next'

import '@fontsource-variable/manrope'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import React from 'react'

import { Footer } from '@/Footer/Component'
import { Header } from '@/Header/Component'

import './globals.css'
import { getServerSideURL } from '@/utilities/getURL'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html data-theme="dark" lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  )
}

export const metadata: Metadata = {
  metadataBase: new URL(getServerSideURL()),
  title: 'HrizonMedia | Secure video. Precisely controlled.',
  description:
    'HrizonMedia is the secure video platform for controlled upload, encrypted delivery, and authorised playback.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon.svg', type: 'image/svg+xml', sizes: '32x32' },
    ],
    apple: [{ url: '/apple-icon.svg', type: 'image/svg+xml', sizes: '180x180' }],
  },
  openGraph: {
    type: 'website',
    title: 'HrizonMedia | Secure video. Precisely controlled.',
    description:
      'Upload once. Deliver encrypted video. Authorise every playback with HrizonMedia.',
    siteName: 'HrizonMedia',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HrizonMedia | Secure video. Precisely controlled.',
    description: 'Plays where you allow it. Nowhere else.',
  },
}
