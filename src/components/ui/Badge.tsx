import { cn } from '@/lib/utils'

interface BadgeProps {
  label: string
  variant?: 'default' | 'green' | 'amber' | 'red' | 'accent'
  className?: string
}

const variantClasses: Record<string, string> = {
  default: 'bg-white/8 text-[var(--ink-2)]',
  green: 'bg-[var(--green-l)] text-[var(--green)]',
  amber: 'bg-[var(--amber-l)] text-[var(--amber)]',
  red: 'bg-[var(--red-l)] text-[var(--red)]',
  accent: 'bg-[var(--accent-light)] text-[var(--accent-text)]',
}

export default function Badge({ label, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        variantClasses[variant],
        className
      )}
    >
      {label}
    </span>
  )
}

export function stageBadgeVariant(stage: string): 'default' | 'green' | 'amber' | 'red' | 'accent' {
  switch (stage) {
    case 'new_enrollment': return 'green'
    case 'possible_registration': return 'accent'
    case 'consultation': return 'amber'
    case 'disenrolled': return 'red'
    default: return 'default'
  }
}
