import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, Card, ConfigBanner, ErrorNotice, LoadingState, MagicLinkSentNotice, PortalLayout } from '../components/ui'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { storePendingInvite } from './LoginPage'

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [invite, setInvite] = useState<{
    email: string
    family_name: string
    invite_role: string
    accepted_at: string | null
  } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('This invite link is missing a token.')
      setLoading(false)
      return
    }
    if (!supabaseConfigured) {
      setLoading(false)
      return
    }
    supabase
      .rpc('get_invite_by_token', { invite_token: token })
      .then(({ data, error: rpcError }) => {
        setLoading(false)
        if (rpcError || !data?.length) {
          setError('This invite link is invalid.')
          return
        }
        const row = data[0]
        setInvite({
          email: row.email,
          family_name: row.family_name,
          invite_role: row.invite_role,
          accepted_at: row.accepted_at,
        })
      })
  }, [token])

  async function sendLoginLink() {
    if (!invite || !supabaseConfigured) return
    setSending(true)
    storePendingInvite(token)
    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}auth/callback`
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: invite.email,
      options: { emailRedirectTo: redirectTo },
    })
    setSending(false)
    if (authError) {
      setError(authError.message || 'Could not send the login link. Please try again.')
      return
    }
    setSent(true)
  }

  if (loading) {
    return (
      <PortalLayout>
        <LoadingState>Loading invite…</LoadingState>
      </PortalLayout>
    )
  }

  return (
    <PortalLayout>
      <ConfigBanner />
      <Card className="max-w-md mx-auto text-center">
        {error ? (
          <>
            <h1 className="text-xl font-display portal-page-title mb-2">Invite problem</h1>
            <div className="mb-4">
              <ErrorNotice message={error} />
            </div>
            <Link to="/login">
              <Button>Go to login</Button>
            </Link>
          </>
        ) : invite ? (
          <>
            <h1 className="text-2xl sm:text-3xl font-display portal-page-title mb-2">
              {sent ? 'Check your email' : 'Welcome to Breeze Swim'}
            </h1>
            {!sent && (
              <p className="portal-muted text-sm mb-6 leading-relaxed">
                You&apos;ve been invited to the client portal
                {invite.invite_role === 'guest' ? ' as a caregiver' : ''} for{' '}
                <strong>{invite.family_name}</strong>&apos;s family.
              </p>
            )}
            {sent ? (
              <MagicLinkSentNotice email={invite.email} />
            ) : (
              <>
                <p className="text-xs text-breeze-muted mb-4">
                  Login email: <strong>{invite.email}</strong>
                </p>
                <Button className="w-full" onClick={sendLoginLink} disabled={sending}>
                  {sending ? 'Sending…' : 'Send my login link'}
                </Button>
                <p className="text-xs portal-muted mt-4">
                  Wrong email? Contact Brielle at breezeswimlessons@gmail.com
                </p>
              </>
            )}
          </>
        ) : null}
      </Card>
    </PortalLayout>
  )
}
