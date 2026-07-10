import { useState } from 'react'
import { Button, Card, Input, PortalLayout } from '../components/ui'
import { supabase } from '../lib/supabase'

export function SetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError('')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (updateError) setError(updateError.message)
    else setMessage('Password saved. You can use it next time you sign in.')
  }

  return (
    <PortalLayout title="Password">
      <Card className="max-w-md mx-auto text-left">
        <h1 className="text-xl sm:text-2xl font-display portal-page-title mb-2">Set a password (optional)</h1>
        <p className="text-sm portal-muted mb-6">
          You can keep using magic links, or set a password for quicker login.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="New password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <Input
            label="Confirm password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-green-700">{message}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Save password'}
          </Button>
        </form>
      </Card>
    </PortalLayout>
  )
}
