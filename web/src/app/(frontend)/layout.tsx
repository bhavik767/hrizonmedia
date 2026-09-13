import type { Metadata } from 'next'

import localFont from 'next/font/local'
import React from 'react'

import { Footer } from '@/Footer/Component'
import { Header } from '@/Header/Component'

import './globals.css'
import { getServerSideURL } from '@/utilities/getURL'

const manrope = localFont({
  src: '../../../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2',
  variable: '--font-manrope',
  weight: '200 800',
})

const plexSans = localFont({
  src: [
    {
      path: '../../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2',
      weight: '400',
    },
    {
      path: '../../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2',
      weight: '500',
    },
    {
      path: '../../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2',
      weight: '600',
    },
  ],
  variable: '--font-plex-sans',
})

const plexMono = localFont({
  src: [
    {
      path: '../../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2',
      weight: '400',
    },
    {
      path: '../../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2',
      weight: '500',
    },
  ],
  variable: '--font-plex-mono',
})

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      className={`${manrope.variable} ${plexSans.variable} ${plexMono.variable}`}
      data-scroll-behavior="smooth"
      data-theme="dark"
      lang="en"
    >
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
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
      { url: '/icon-32.png', type: 'image/png', sizes: '32x32' },
    ],
    apple: [{ url: '/apple-touch-icon.png', type: 'image/png', sizes: '180x180' }],
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
