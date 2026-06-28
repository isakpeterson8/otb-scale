'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function EducationTabBar() {
  const pathname = usePathname()
  const isResources = pathname.startsWith('/education/resources')

  return (
    <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--surface)' }}>
      <Link
        href="/education/videos"
        className={[
          'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
          !isResources
            ? 'bg-[var(--accent-l)] text-[var(--accent-text)]'
            : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]',
        ].join(' ')}
      >
        Videos
      </Link>
      <Link
        href="/education/resources"
        className={[
          'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
          isResources
            ? 'bg-[var(--accent-l)] text-[var(--accent-text)]'
            : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]',
        ].join(' ')}
      >
        Resources
      </Link>
    </div>
  )
}
