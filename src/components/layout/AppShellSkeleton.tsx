export default function AppShellSkeleton() {
  return (
    <div className="flex min-h-screen bg-[var(--canvas)]">
      {/* Mobile header placeholder */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 h-14 bg-[var(--sidebar)] border-b border-black/8" />

      {/* Sidebar skeleton */}
      <aside className="hidden md:flex w-[240px] shrink-0 flex-col bg-[var(--sidebar)] sticky top-0 h-screen">
        {/* Logo area */}
        <div className="px-5 py-6">
          <div className="h-9 w-[100px] rounded-md bg-black/8 animate-pulse" />
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {[72, 48, 88, 76, 64, 100, 84, 68, 56].map((w, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2.5 min-h-[44px]">
              <div className="w-4 h-4 rounded bg-black/8 shrink-0 animate-pulse" />
              <div className="h-3 rounded bg-black/8 animate-pulse" style={{ width: w }} />
            </div>
          ))}
        </nav>

        {/* User info */}
        <div className="px-3 pt-3 pb-4 border-t border-black/8">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-black/8 shrink-0 animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-20 rounded bg-black/8 animate-pulse" />
              <div className="h-2 w-12 rounded bg-black/8 animate-pulse" />
            </div>
          </div>
        </div>
      </aside>

      {/* Content area */}
      <div className="flex-1 flex flex-col min-w-0 pt-14 md:pt-0">
        <main className="flex-1 px-4 md:px-8 py-5 md:py-7 space-y-6">
          {/* Page heading */}
          <div className="space-y-2">
            <div className="h-7 w-44 rounded-lg bg-[var(--surface)] animate-pulse" />
            <div className="h-4 w-64 rounded bg-[var(--surface)] animate-pulse" />
          </div>

          {/* Primary content block */}
          <div className="bg-[var(--surface)] rounded-2xl p-5 space-y-3">
            {[85, 70, 90, 60, 78].map((w, i) => (
              <div key={i} className="h-4 rounded bg-black/6 animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>

          {/* Secondary content block */}
          <div className="bg-[var(--surface)] rounded-2xl p-5 space-y-3">
            {[65, 80, 55].map((w, i) => (
              <div key={i} className="h-4 rounded bg-black/6 animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
