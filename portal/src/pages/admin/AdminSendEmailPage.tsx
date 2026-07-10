import { useEffect, useState } from 'react'
import { AdminNav } from '../../components/AdminNav'
import { Button, Card, PageTitle, PortalLayout } from '../../components/ui'
import { callEdgeFunction } from '../../lib/edge'
import { supabase } from '../../lib/supabase'
import type { Family } from '../../lib/types'

const TEMPLATES = [
  {
    id: 'weather',
    label: 'Pool closed today',
    subject: 'Breeze Swim — pool closed today',
    body: 'Hi! The pool is closed today due to weather. We will follow up about make-up lessons. Stay dry and safe!',
  },
  {
    id: 'payment_due',
    label: 'Payment reminder',
    subject: 'Breeze Swim — weekly payment due',
    body: 'Hi! A friendly reminder that your $90 weekly lesson payment is due. Please send via Zelle or let Brielle know if you have questions. Thank you!',
  },
  {
    id: 'custom',
    label: 'Custom message',
    subject: '',
    body: '',
  },
]

export function AdminSendEmailPage() {
  const [families, setFamilies] = useState<Family[]>([])
  const [familyId, setFamilyId] = useState('all')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('families')
      .select('*')
      .order('primary_name')
      .then(({ data }) => setFamilies((data as Family[]) || []))
  }, [])

  function applyTemplate(id: string) {
    const t = TEMPLATES.find((x) => x.id === id)
    if (!t) return
    setSubject(t.subject)
    setBody(t.body)
  }

  async function send() {
    if (!subject.trim() || !body.trim()) {
      setError('Subject and message are required.')
      return
    }
    setSending(true)
    setError('')
    setMessage('')
    try {
      const result = await callEdgeFunction<{
        families: number
        emailed: number
        errors: string[]
      }>('send-email', {
        family_id: familyId,
        subject: subject.trim(),
        body: body.trim(),
        message_type: familyId === 'all' ? 'announcement' : 'custom',
        send_email: true,
      })
      setMessage(
        `Saved to ${result.families} family inbox(es). Emailed ${result.emailed} parent(s).${
          result.errors?.length ? ` Some emails failed.` : ''
        }`,
      )
    } catch (e) {
      if (familyId === 'all') {
        const { data, error: rpcError } = await supabase.rpc('broadcast_message', {
          p_subject: subject.trim(),
          p_body: body.trim(),
          p_message_type: 'announcement',
        })
        if (rpcError) setError(rpcError.message)
        else setMessage(`Message saved to ${data} family inbox(es). (Email not sent — deploy send-email function.)`)
      } else {
        const { error: rpcError } = await supabase.rpc('send_family_message', {
          p_family_id: familyId,
          p_subject: subject.trim(),
          p_body: body.trim(),
          p_message_type: 'custom',
        })
        if (rpcError) setError(rpcError.message)
        else setMessage('Message saved to family inbox. (Email not sent — deploy send-email function.)')
      }
    }
    setSending(false)
  }

  return (
    <PortalLayout title="Admin">
      <AdminNav />
      <PageTitle subtitle="Messages appear in each family's portal inbox. Email sends when Resend is configured.">
        Send email
      </PageTitle>

      <Card className="text-left space-y-4">
        <div>
          <p className="text-sm font-semibold text-breeze-deep mb-2">Quick templates</p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t.id)}
                className="rounded-full border border-breeze-sky/30 px-4 py-1.5 text-xs font-bold text-breeze-deep hover:border-breeze-sky"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-semibold text-breeze-deep">Send to</span>
          <select
            value={familyId}
            onChange={(e) => setFamilyId(e.target.value)}
            className="portal-input"
          >
            <option value="all">All active families</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.primary_name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-breeze-deep">Subject</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="portal-input"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-breeze-deep">Message</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            className="portal-input"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-green-700">{message}</p>}

        <Button onClick={send} disabled={sending}>
          {sending ? 'Sending…' : 'Send message'}
        </Button>
      </Card>
    </PortalLayout>
  )
}
