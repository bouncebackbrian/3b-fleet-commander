import type { Metadata } from 'next'
import './globals.css'
export const metadata: Metadata = {
  title: '3B Fleet Commander — Mileage Intelligence System',
  description: '3B Fleet Commander · Mileage Intelligence System — Load tracking, settlement audit, delay & detention, fuel log.',
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
