import type { Metadata, Viewport } from 'next'
import './globals.css'

const BASE_URL = 'https://fleet.bouncebackbrian.com'

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),

  title: {
    default:  '3B Fleet Commander — Operational Command Center',
    template: '%s · 3B Fleet Commander',
  },

  description:
    'The operational command center built for owner-operators. Live HOS countdown, multi-stop mission timeline, route risk scanner, ELD movement alerts, and offline-safe cloud sync — all from your iPad or phone.',

  keywords: [
    'owner operator app',
    'trucking command center',
    'HOS tracking',
    'ELD alerts',
    'multi-stop mission',
    'route planning trucking',
    'fleet management app',
    'trucker app',
    'dispatch tool',
    'load analyzer',
    'fuel stop planner',
    'settlement audit',
    'FMCSA HOS rules',
    'Samsara integration',
    '3B Fleet Commander',
  ],

  authors: [{ name: '3B Ecosystem', url: BASE_URL }],
  creator:  '3B Ecosystem',
  publisher: '3B Ecosystem',

  robots: {
    index:  true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },

  alternates: {
    canonical: BASE_URL,
  },

  // ── Open Graph ──────────────────────────────────────────────────────────────
  openGraph: {
    type:        'website',
    locale:      'en_US',
    url:          BASE_URL,
    siteName:    '3B Fleet Commander',
    title:       '3B Fleet Commander — One screen. Every load.',
    description: 'Operational command center for owner-operators. Live HOS, multi-stop missions, ELD alerts, route risk intelligence, offline-first.',
    images: [{
      url:    '/opengraph-image',
      width:   1200,
      height:  630,
      alt:    '3B Fleet Commander — Operational Command Center for Owner-Operators',
    }],
  },

  // ── Twitter / X card ───────────────────────────────────────────────────────
  twitter: {
    card:        'summary_large_image',
    title:       '3B Fleet Commander — One screen. Every load.',
    description: 'Operational command center for owner-operators. Live HOS, multi-stop missions, ELD movement alerts.',
    images:      ['/opengraph-image'],
    creator:     '@3becosystem',
  },

  // ── PWA ────────────────────────────────────────────────────────────────────
  manifest: '/manifest.json',
  appleWebApp: {
    capable:         true,
    statusBarStyle: 'black-translucent',
    title:          '3B Fleet',
  },

  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },

  other: {
    'mobile-web-app-capable':              'yes',
    'apple-mobile-web-app-capable':        'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title':          '3B Fleet',
    'msapplication-TileColor':             '#061210',
    'msapplication-TileImage':             '/icons/icon-192.png',
  },
}

export const viewport: Viewport = {
  width:          'device-width',
  initialScale:    1,
  maximumScale:    1,
  userScalable:    false,
  themeColor:     '#061210',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
