import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'OTB Scale',
  description: 'Studio Platform',
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
