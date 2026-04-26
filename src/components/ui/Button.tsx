import { cn } from '@/lib/utils'
import { type ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

const variantClasses = {
  primary: 'bg-[var(--accent)] text-[var(--ink)] hover:bg-[var(--accent-text)] hover:text-[var(--canvas)]',
  ghost: 'border border-[var(--ink)]/15 text-[var(--ink-2)] hover:bg-white/6 hover:text-[var(--ink)]',
  danger: 'bg-[var(--red-l)] text-[var(--red)] hover:bg-[var(--red)] hover:text-[var(--ink)]',
}

const sizeClasses = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2 text-sm rounded-xl',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
