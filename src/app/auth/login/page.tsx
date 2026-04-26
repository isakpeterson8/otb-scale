'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { signInWithEmail, signUpWithEmail, resetPassword } from '@/app/actions/auth'

type Mode = 'login' | 'signup' | 'forgot'

function LoginCard() {
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') ?? '/dashboard'
  const [googleLoading, setGoogleLoading] = useState(false)
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleGoogleSignIn() {
    setGoogleLoading(true)
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    if (mode === 'login') {
      const res = await signInWithEmail(email, password)
      if (res?.error) setError(res.error)
    } else if (mode === 'signup') {
      if (password !== confirm) {
        setError('Passwords do not match')
        setLoading(false)
        return
      }
      const res = await signUpWithEmail(email, password)
      if (res?.error) setError(res.error)
      else setSuccess('Check your email to confirm your account.')
    } else if (mode === 'forgot') {
      const res = await resetPassword(email)
      if (res?.error) setError(res.error)
      else setSuccess('Password reset link sent — check your email.')
    }

    setLoading(false)
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setSuccess(null)
    setPassword('')
    setConfirm('')
  }

  return (
    <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-8 w-full max-w-sm flex flex-col gap-5">
      {/* Google SSO */}
      <button
        onClick={handleGoogleSignIn}
        disabled={googleLoading}
        className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-[var(--border-s)] bg-[var(--canvas)] text-sm font-medium text-[var(--ink)] hover:bg-[var(--surface-2)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
          <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
        </svg>
        {googleLoading ? 'Redirecting…' : 'Continue with Google'}
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-[var(--border)]" />
        <span className="text-xs text-[var(--ink-3)]">or</span>
        <div className="flex-1 h-px bg-[var(--border)]" />
      </div>

      {/* Email/password form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="w-full px-3 py-2.5 rounded-xl border border-[var(--border-s)] bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:border-[var(--accent)] transition-colors"
        />

        {mode !== 'forgot' && (
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full px-3 py-2.5 rounded-xl border border-[var(--border-s)] bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        )}

        {mode === 'signup' && (
          <input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            className="w-full px-3 py-2.5 rounded-xl border border-[var(--border-s)] bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        )}

        {error && (
          <p className="text-xs text-[var(--red)] bg-[var(--red-l)] px-3 py-2 rounded-lg">{error}</p>
        )}
        {success && (
          <p className="text-xs text-[var(--green)] bg-[var(--green-l)] px-3 py-2 rounded-lg">{success}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
        >
          {loading
            ? '…'
            : mode === 'login'
            ? 'Log in'
            : mode === 'signup'
            ? 'Create account'
            : 'Send reset link'}
        </button>
      </form>

      {/* Mode toggles */}
      <div className="flex flex-col items-center gap-1.5 text-xs text-[var(--ink-3)]">
        {mode === 'login' && (
          <>
            <button
              onClick={() => switchMode('forgot')}
              className="hover:text-[var(--ink)] transition-colors"
            >
              Forgot password?
            </button>
            <span>
              No account?{' '}
              <button
                onClick={() => switchMode('signup')}
                className="text-[var(--accent)] hover:opacity-80 transition-opacity"
              >
                Sign up
              </button>
            </span>
          </>
        )}
        {mode === 'signup' && (
          <span>
            Already have an account?{' '}
            <button
              onClick={() => switchMode('login')}
              className="text-[var(--accent)] hover:opacity-80 transition-opacity"
            >
              Log in
            </button>
          </span>
        )}
        {mode === 'forgot' && (
          <button
            onClick={() => switchMode('login')}
            className="hover:text-[var(--ink)] transition-colors"
          >
            Back to log in
          </button>
        )}
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--canvas)] px-4">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="flex justify-center">
          <img
            src="/otb-logo.png"
            alt="Outside The Bachs"
            width={120}
            style={{ objectFit: 'contain' }}
          />
        </div>

        <Suspense fallback={<div className="h-16" />}>
          <LoginCard />
        </Suspense>
      </div>
    </main>
  )
}
