import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button,
  Card,
  ConfigBanner,
  ErrorNotice,
  MagicLinkSentNotice,
  PortalLayout,
} from '../components/ui'
import { supabase, supabaseConfigured } from '../lib/supabase'

const INVITE_KEY = 'breeze_pending_invite'

export function storePendingInvite(token: string) {
  sessionStorage.setItem(INVITE_KEY, token)
}

export function takePendingInvite() {
  const token = sessionStorage.getItem(INVITE_KEY)
  if (token) sessionStorage.removeItem(INVITE_KEY)
  return token
}

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [usePassword, setUsePassword] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const e = searchParams.get('email')
    if (e) setEmail(e)
  }, [searchParams])

  useEffect(() => {
    if (sent) window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [sent])

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!supabaseConfigured) {
      setError('Supabase is not configured yet.')
      return
    }
    setLoading(true)
    setError('')
    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}auth/callback`
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    })
    setLoading(false)
    if (authError) {
      setError(authError.message || 'Could not send the login link. Please try again.')
      return
    }
    setSent(true)
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!supabaseConfigured) {
      setError('Supabase is not configured yet.')
      return
    }
    setLoading(true)
    setError('')
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setLoading(false)
    if (authError) {
      setError(authError.message)
      return
    }

    const token = takePendingInvite()
    if (token) {
      const { error: inviteError } = await supabase.rpc('accept_family_invite', {
        invite_token: token,
      })
      if (inviteError) {
        setError(inviteError.message)
        return
      }
    }

    const { data: prof } = await supabase
      .from('profiles')
      .select('role, welcome_completed_at, family_id')
      .eq('id', data.user.id)
      .maybeSingle()

    if (prof?.role === 'admin') navigate('/admin', { replace: true })
    else if (prof?.family_id && !prof.welcome_completed_at) navigate('/welcome', { replace: true })
    else if (prof?.family_id) navigate('/app', { replace: true })
    else navigate('/', { replace: true })
  }

  return (
    <PortalLayout>
      <ConfigBanner />
      <Card className="max-w-md mx-auto text-center">
        <h1 className="text-2xl sm:text-3xl font-display portal-page-title text-center mb-2">
          {sent ? 'Check your email' : 'Client login'}
        </h1>
        {!sent && (
          <p className="portal-muted text-sm mb-6 leading-relaxed">
            {usePassword
              ? 'Sign in with the password you set after your first login.'
              : 'Enter the email Brielle has on file. We\u2019ll send you a secure login link — no password needed.'}
          </p>
        )}
        {sent ? (
          <MagicLinkSentNotice email={email} onTryDifferentEmail={() => setSent(false)} />
        ) : usePassword ? (
          <form onSubmit={signInWithPassword} className="space-y-4 text-left">
            <label className="block">
              <span className="text-sm font-semibold text-breeze-deep">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                className="portal-input"
                placeholder="you@example.com"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-breeze-deep">Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                className="portal-input"
                autoComplete="current-password"
              />
            </label>
            {error && <ErrorNotice message={error} />}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
            <button
              type="button"
              onClick={() => {
                setUsePassword(false)
                setError('')
              }}
              className="text-sm text-breeze-deep font-semibold hover:text-breeze-sky"
            >
              Use magic link instead
            </button>
          </form>
        ) : (
          <form onSubmit={sendMagicLink} className="space-y-4 text-left">
            <label className="block">
              <span className="text-sm font-semibold text-breeze-deep">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                className="portal-input"
                placeholder="you@example.com"
              />
            </label>
            {error && <ErrorNotice message={error} />}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Sending…' : 'Email me a login link'}
            </Button>
            <button
              type="button"
              onClick={() => {
                setUsePassword(true)
                setError('')
              }}
              className="text-sm text-breeze-deep font-semibold hover:text-breeze-sky"
            >
              Sign in with password instead
            </button>
          </form>
        )}
        <p className="text-xs portal-muted mt-6">
          <Link to="/" className="text-breeze-deep hover:text-breeze-sky">
            ← Back to portal home
          </Link>
        </p>
      </Card>
    </PortalLayout>
  )
}

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    async function finish() {
      if (!supabaseConfigured) return
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !data.session) {
        setError(sessionError?.message || 'Could not sign in. Try again.')
        return
      }

      const token = takePendingInvite()
      if (token) {
        const { error: inviteError } = await supabase.rpc('accept_family_invite', {
          invite_token: token,
        })
        if (inviteError) {
          setError(inviteError.message)
          return
        }
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('role, welcome_completed_at, family_id')
        .eq('id', data.session.user.id)
        .maybeSingle()

      if (prof?.role === 'admin') navigate('/admin', { replace: true })
      else if (prof?.family_id && !prof.welcome_completed_at) navigate('/welcome', { replace: true })
      else if (prof?.family_id) navigate('/app', { replace: true })
      else navigate('/', { replace: true })
    }
    finish()
  }, [navigate])

  return (
    <PortalLayout>
      <Card className="text-center">
        {error ? (
          <>
            <p className="text-red-600 mb-4">{error}</p>
            <Link to="/login">
              <Button>Back to login</Button>
            </Link>
          </>
        ) : (
          <p className="portal-muted">Signing you in…</p>
        )}
      </Card>
    </PortalLayout>
  )
}
