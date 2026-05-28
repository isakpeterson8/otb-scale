import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Studio | Outside The Bachs: Scale',
    template: '%s | Outside The Bachs: Scale',
  },
  description: 'Studio growth platform for Outside The Bachs: Scale members.',
  icons: { icon: '/otb-logo.png' },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col" style={{ fontFamily: 'var(--font-sans)' }}>
        {children}
      </body>
    </html>
  )
}
