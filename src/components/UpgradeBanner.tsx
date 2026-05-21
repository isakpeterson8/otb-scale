interface Props {
  feature: string
}

export default function UpgradeBanner({ feature }: Props) {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[360px] px-4">
      <div className="text-center max-w-xs">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{ background: 'var(--accent-l)' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 2l2.5 5.5 5.5.8-4 3.9 1 5.5L12 15l-5 2.7 1-5.5-4-3.9 5.5-.8L12 2z"
              fill="currentColor"
              style={{ color: 'var(--accent-text)' }}
            />
          </svg>
        </div>
        <h3
          className="text-lg font-medium mb-2"
          style={{ fontFamily: 'var(--font-heading)', color: 'var(--ink)' }}
        >
          Upgrade needed.
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-3)' }}>
          Upgrade to unlock {feature}.{' '}
          Contact{' '}
          <a
            href="mailto:support@outsidethebachs.com"
            className="underline"
            style={{ color: 'var(--accent-text)' }}
          >
            support@outsidethebachs.com
          </a>{' '}
          to upgrade.
        </p>
      </div>
    </div>
  )
}
