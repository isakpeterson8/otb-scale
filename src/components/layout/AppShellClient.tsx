'use client'

import { useState } from 'react'
import Sidebar from './Sidebar'
import { ViewAsBanner } from './ViewAsBanner'

interface Props {
  children: React.ReactNode
  displayName: string
  isAdmin: boolean
  viewOnly: boolean
  viewAsEmail: string | null
}

export default function AppShellClient({ children, displayName, isAdmin, viewOnly, viewAsEmail }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-[var(--canvas)]">
      {/* Mobile header — hidden on md+ */}
      <header className="md:hidden fixed top-0 inset-x-0 z-30 h-14 flex items-center justify-between px-4 bg-[var(--sidebar)] border-b border-white/8">
        <button
          onClick={() => setSidebarOpen(true)}
          className="flex items-center justify-center w-10 h-10 text-[var(--ink)]/60 hover:text-[var(--ink)] transition-colors"
          aria-label="Open menu"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <img src="/otb-logo.png" alt="Outside The Bachs" width={90} style={{ objectFit: 'contain' }} />
        {/* Right spacer keeps logo centred */}
        <div className="w-10" />
      </header>

      <Sidebar
        displayName={displayName}
        isAdmin={isAdmin}
        viewOnly={viewOnly}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 pt-14 md:pt-0 overflow-x-hidden">
        {viewAsEmail && <ViewAsBanner email={viewAsEmail} />}
        {children}
      </div>
    </div>
  )
}
