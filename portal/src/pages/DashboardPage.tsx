import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Card, PageTitle, PortalLayout, SectionTitle } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { parentPricingSummary, paymentDueLabel } from '../lib/pricing'
import type { Enrollment, Family, Message, Payment, RegistrationFee, Swimmer } from '../lib/types'
import { formatCents } from '../lib/types'

function formatTime(t: string | null) {
  if (!t) return 'Time TBD'
  const [h, m] = t.split(':')
  const hour = parseInt(h, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 || 12
  return `${h12}:${m} ${ampm}`
}

export function DashboardPage() {
  const { profile } = useAuth()
  const [family, setFamily] = useState<Family | null>(null)
  const [swimmers, setSwimmers] = useState<Swimmer[]>([])
  const [enrollmentsBySwimmer, setEnrollmentsBySwimmer] = useState<Record<string, Enrollment>>({})
  const [duePayments, setDuePayments] = useState<Payment[]>([])
  const [paidPayments, setPaidPayments] = useState<Payment[]>([])
  const [registrationFees, setRegistrationFees] = useState<RegistrationFee[]>([])
  const [messages, setMessages] = useState<Message[]>([])

  useEffect(() => {
    if (!profile?.family_id) return
    async function load() {
      const famId = profile!.family_id!
      const { data: fam } = await supabase.from('families').select('*').eq('id', famId).single()
      setFamily(fam as Family)

      const { data: sw } = await supabase.from('swimmers').select('*').eq('family_id', famId)
      const swimmersList = (sw as Swimmer[]) || []
      setSwimmers(swimmersList)

      if (swimmersList.length) {
        const [{ data: enr }, { data: fees }] = await Promise.all([
          supabase
            .from('enrollments')
            .select('*')
            .in(
              'swimmer_id',
              swimmersList.map((s) => s.id),
            ),
          supabase
            .from('registration_fees')
            .select('*')
            .in(
              'swimmer_id',
              swimmersList.map((s) => s.id),
            )
            .order('fee_year', { ascending: false }),
        ])
        const bySwimmer: Record<string, Enrollment> = {}
        for (const e of (enr as Enrollment[]) || []) {
          bySwimmer[e.swimmer_id] = e
        }
        setEnrollmentsBySwimmer(bySwimmer)
        setRegistrationFees((fees as RegistrationFee[]) || [])
      }

      const [{ data: due }, { data: paid }, { data: msgs }] = await Promise.all([
        supabase
          .from('payments')
          .select('*')
          .eq('family_id', famId)
          .eq('status', 'due')
          .order('due_date', { ascending: true }),
        supabase
          .from('payments')
          .select('*')
          .eq('family_id', famId)
          .eq('status', 'paid')
          .order('paid_at', { ascending: false })
          .limit(6),
        supabase
          .from('messages')
          .select('*')
          .or(`family_id.eq.${famId},family_id.is.null`)
          .order('created_at', { ascending: false })
          .limit(8),
      ])

      setDuePayments((due as Payment[]) || [])
      setPaidPayments((paid as Payment[]) || [])
      setMessages((msgs as Message[]) || [])
    }
    load()
  }, [profile])

  if (!profile) return null
  if (!profile.welcome_completed_at) return <Navigate to="/welcome" replace />

  const isGuest = profile.role === 'parent_guest'
  const balanceCents =
    duePayments.reduce((sum, p) => sum + p.amount_cents, 0) +
    registrationFees.filter((r) => r.status === 'due').reduce((sum, r) => sum + r.amount_cents, 0)

  return (
    <PortalLayout title="My lessons">
      <div className="space-y-6">
        <PageTitle subtitle="Your Breeze Swim client portal">
          Hi{profile.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}!
        </PageTitle>

        {messages.length > 0 && (
          <Card className="text-left">
            <SectionTitle>Messages from Brielle</SectionTitle>
            <ul className="space-y-4">
              {messages.map((m) => (
                <li key={m.id} className="border-b border-breeze-sky/10 pb-3 last:border-0 last:pb-0">
                  <p className="font-semibold text-breeze-deep text-sm">{m.subject}</p>
                  <p className="text-sm portal-muted mt-1 whitespace-pre-wrap">{m.body}</p>
                  <p className="text-xs text-breeze-muted/70 mt-1">
                    {new Date(m.created_at).toLocaleDateString()}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="text-left">
            <SectionTitle>This week</SectionTitle>
          <p className="text-sm portal-muted mb-3">
            <strong>Schedule:</strong> Monday–Thursday · <strong>Format:</strong> 15-minute private lessons
          </p>
          {swimmers.length === 0 ? (
            <p className="text-sm portal-muted">Lesson times will appear here once swimmers are on file.</p>
          ) : (
            <ul className="text-sm portal-muted space-y-3">
              {swimmers.map((s) => {
                const enr = enrollmentsBySwimmer[s.id]
                return (
                  <li key={s.id} className={swimmers.length > 1 ? 'border-b border-breeze-sky/10 pb-3 last:border-0 last:pb-0' : ''}>
                    {swimmers.length > 1 && (
                      <p className="font-semibold text-breeze-deep mb-1">{s.name}</p>
                    )}
                    <ul className="space-y-1">
                      <li>
                        <strong>Time:</strong> {formatTime(enr?.lesson_time ?? null)}
                      </li>
                      <li>
                        <strong>Location:</strong>{' '}
                        {enr?.location === 'client_pool'
                          ? 'Your private pool'
                          : 'Bunnell (private pool)'}
                      </li>
                      {enr?.start_date && (
                        <li>
                          <strong>Program:</strong> {enr.start_date} – {enr.end_date || 'ongoing'}
                        </li>
                      )}
                    </ul>
                  </li>
                )
              })}
            </ul>
          )}
          {family?.pool_address && (
            <div className="mt-4 pt-4 border-t border-breeze-sky/10 text-sm">
              <p className="font-semibold text-breeze-deep">{family.pool_address}</p>
              {family.gate_instructions && (
                <p className="portal-muted mt-1 whitespace-pre-wrap">{family.gate_instructions}</p>
              )}
            </div>
          )}
        </Card>

        <Card className="text-left">
            <SectionTitle>Swimmer(s)</SectionTitle>
          {swimmers.length === 0 ? (
            <p className="text-sm portal-muted">No swimmers on file yet.</p>
          ) : (
            <ul className="space-y-3">
              {swimmers.map((s) => {
                const enr = enrollmentsBySwimmer[s.id]
                return (
                  <li key={s.id} className="text-sm">
                    <p className="font-semibold text-breeze-deep">{s.name}</p>
                    <p className="portal-muted capitalize">{s.status}</p>
                    {enr && (
                      <p className="portal-muted mt-1">
                        {formatTime(enr.lesson_time)} ·{' '}
                        {enr.location === 'client_pool' ? 'Client pool' : 'Bunnell'}
                        {enr.start_date && (
                          <> · {enr.start_date} – {enr.end_date || 'TBD'}</>
                        )}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {!isGuest && (
          <Card className="text-left">
            <SectionTitle>Payments</SectionTitle>
            {balanceCents > 0 ? (
              <p className="text-sm text-breeze-pink font-semibold mb-3">
                Balance due: {formatCents(balanceCents)}
              </p>
            ) : (
              <p className="text-sm text-green-700 font-semibold mb-3">You&apos;re all caught up!</p>
            )}
            <p className="text-sm portal-muted leading-relaxed">
              <strong>{parentPricingSummary(family?.billing_model)}</strong>
            </p>
            <p className="text-sm portal-muted mt-2">
              {family?.zelle_instructions || 'Contact Brielle for payment details.'}
            </p>

            {duePayments.length > 0 && (
              <div className="mt-4 pt-4 border-t border-breeze-sky/10">
                <p className="text-xs font-bold uppercase tracking-widest portal-muted mb-2">Due</p>
                <ul className="text-sm space-y-1">
                  {duePayments.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2">
                      <span>{paymentDueLabel(p)}</span>
                      <span className="font-semibold">{formatCents(p.amount_cents)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {registrationFees.some((r) => r.status === 'due') && (
              <div className="mt-4 pt-4 border-t border-breeze-sky/10">
                <p className="text-xs font-bold uppercase tracking-widest portal-muted mb-2">
                  Registration
                </p>
                <ul className="text-sm space-y-1">
                  {registrationFees
                    .filter((r) => r.status === 'due')
                    .map((r) => {
                      const swimmer = swimmers.find((s) => s.id === r.swimmer_id)
                      return (
                        <li key={r.id} className="flex justify-between gap-2">
                          <span>
                            {swimmers.length > 1 && swimmer ? `${swimmer.name} · ` : ''}
                            {r.fee_year} annual fee
                          </span>
                          <span className="font-semibold">{formatCents(r.amount_cents)}</span>
                        </li>
                      )
                    })}
                </ul>
              </div>
            )}

            {paidPayments.length > 0 && (
              <div className="mt-4 pt-4 border-t border-breeze-sky/10">
                <p className="text-xs font-bold uppercase tracking-widest portal-muted mb-2">
                  Recent payments
                </p>
                <ul className="text-sm space-y-1">
                  {paidPayments.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2 portal-muted">
                      <span>
                        {paymentDueLabel(p)} · <span className="capitalize">{p.method}</span>
                      </span>
                      <span>{formatCents(p.amount_cents)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}

        <Card className="text-left">
          <SectionTitle className="mb-2">Questions?</SectionTitle>
          <p className="text-sm portal-muted">
            Email{' '}
            <a href="mailto:breezeswimlessons@gmail.com" className="text-breeze-deep font-semibold">
              breezeswimlessons@gmail.com
            </a>{' '}
            or see the{' '}
            <a href="../faq.html" className="text-breeze-deep font-semibold">
              FAQ
            </a>
            .
          </p>
        </Card>

        <p className="text-center text-sm">
          <Link to="/set-password" className="text-breeze-deep font-semibold hover:text-breeze-sky">
            Set a password (optional)
          </Link>
        </p>
      </div>
    </PortalLayout>
  )
}
