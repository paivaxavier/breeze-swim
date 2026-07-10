import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Input, LoadingState, PortalLayout, Textarea } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { supabase, supabaseConfigured } from '../lib/supabase'
import {
  FULL_WELCOME_STEPS,
  SHORT_WELCOME_STEPS,
  type Enrollment,
  type Family,
  type Swimmer,
} from '../lib/types'

function formatTime(t: string | null) {
  if (!t) return 'Time TBD'
  const [h, m] = t.split(':')
  const hour = parseInt(h, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 || 12
  return `${h12}:${m} ${ampm}`
}

export function WelcomePage() {
  const { profile, user, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [family, setFamily] = useState<Family | null>(null)
  const [swimmers, setSwimmers] = useState<Swimmer[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [, setCompleted] = useState<Set<string>>(new Set())
  const [stepIndex, setStepIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [policiesOk, setPoliciesOk] = useState(false)

  const steps = useMemo(
    () => (profile?.welcome_type === 'short' ? SHORT_WELCOME_STEPS : FULL_WELCOME_STEPS),
    [profile?.welcome_type],
  )
  const current = steps[stepIndex]
  const enrollmentsBySwimmer = useMemo(() => {
    const map: Record<string, Enrollment> = {}
    for (const enr of enrollments) {
      map[enr.swimmer_id] = enr
    }
    return map
  }, [enrollments])

  useEffect(() => {
    if (!profile) return
    if (profile.welcome_completed_at) {
      navigate('/app', { replace: true })
      return
    }
    if (!profile.family_id || !supabaseConfigured) {
      setLoading(false)
      return
    }

    async function load() {
      const famId = profile!.family_id!
      const [famRes, swimRes, progRes] = await Promise.all([
        supabase.from('families').select('*').eq('id', famId).single(),
        supabase.from('swimmers').select('*').eq('family_id', famId),
        supabase.from('welcome_progress').select('step_key').eq('profile_id', profile!.id),
      ])

      setFamily(famRes.data as Family)
      const sw = (swimRes.data as Swimmer[]) || []
      setSwimmers(sw)

      if (sw.length) {
        const { data: enr } = await supabase
          .from('enrollments')
          .select('*')
          .in(
            'swimmer_id',
            sw.map((s) => s.id),
          )
        setEnrollments((enr as Enrollment[]) || [])
      }

      const done = new Set((progRes.data || []).map((r) => r.step_key))
      setCompleted(done)
      const firstIncomplete = steps.findIndex((s) => !done.has(s.key))
      setStepIndex(firstIncomplete >= 0 ? firstIncomplete : 0)
      setLoading(false)
    }
    load()
  }, [profile, navigate, steps])

  async function saveStep(stepKey: string, data: Record<string, unknown> = {}) {
    setSaving(true)
    await supabase.rpc('complete_welcome_step', {
      p_step_key: stepKey,
      p_step_data: data,
    })
    setCompleted((prev) => new Set(prev).add(stepKey))
    setSaving(false)
    if (stepIndex < steps.length - 1) setStepIndex(stepIndex + 1)
    else await finishWelcome()
  }

  async function finishWelcome() {
    setSaving(true)
    await supabase.rpc('finish_welcome')
    await refreshProfile()
    setSaving(false)
    navigate('/app', { replace: true })
  }

  async function saveContact() {
    if (!family || !profile) return
    await supabase
      .from('families')
      .update({
        primary_name: family.primary_name,
        primary_phone: family.primary_phone,
      })
      .eq('id', family.id)
    await supabase
      .from('profiles')
      .update({ full_name: family.primary_name, phone: family.primary_phone })
      .eq('id', profile.id)
    await saveStep('contact')
  }

  async function saveSwimmerNotes() {
    if (!swimmers.length) {
      await saveStep('swimmer')
      return
    }
    for (const swimmer of swimmers) {
      await supabase.rpc('update_swimmer_with_notification', {
        p_swimmer_id: swimmer.id,
        p_adaptive_notes: swimmer.adaptive_notes || '',
      })
    }
    await saveStep('swimmer')
  }

  if (loading || !profile) {
    return (
      <PortalLayout title="Welcome">
        <LoadingState />
      </PortalLayout>
    )
  }

  if (!profile.family_id) {
    return (
      <PortalLayout title="Welcome">
        <Card>
          <p className="portal-muted text-sm">
            Your account isn&apos;t linked to a family yet. Use the invite link Brielle sent, or
            contact breezeswimlessons@gmail.com
          </p>
        </Card>
      </PortalLayout>
    )
  }

  return (
    <PortalLayout title="Welcome">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-breeze-sky mb-1">
          Step {stepIndex + 1} of {steps.length}
        </p>
        <h1 className="text-2xl sm:text-3xl font-display portal-page-title">{current.title}</h1>
        <div className="mt-3 h-2.5 rounded-full bg-breeze-foam-water overflow-hidden border border-breeze-sky/15">
          <div
            className="h-full bg-gradient-to-r from-breeze-pink to-breeze-coral transition-all"
            style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      <Card className="text-left space-y-4">
        {current.key === 'contact' && family && (
          <>
            <Input
              label="Your name"
              value={family.primary_name}
              onChange={(e) => setFamily({ ...family, primary_name: e.target.value })}
            />
            <Input label="Email" value={user?.email || family.primary_email} disabled />
            <Input
              label="Phone"
              type="tel"
              value={family.primary_phone || ''}
              onChange={(e) => setFamily({ ...family, primary_phone: e.target.value })}
            />
            <Button onClick={saveContact} disabled={saving}>
              Continue
            </Button>
          </>
        )}

        {current.key === 'swimmer' && (
          <>
            {swimmers.length === 0 ? (
              <p className="text-sm portal-muted">Swimmer details will be added by Brielle.</p>
            ) : (
              <div className="space-y-6">
                {swimmers.map((swimmer) => (
                  <div
                    key={swimmer.id}
                    className={
                      swimmers.length > 1 ? 'space-y-3 pb-6 border-b portal-divider last:border-0 last:pb-0' : 'space-y-3'
                    }
                  >
                    <p className="text-sm portal-muted">
                      Swimmer: <strong>{swimmer.name}</strong>
                      {swimmer.date_of_birth && (
                        <> · DOB {new Date(swimmer.date_of_birth).toLocaleDateString()}</>
                      )}
                    </p>
                    <Textarea
                      label="Adaptive / safety notes (optional)"
                      value={swimmer.adaptive_notes || ''}
                      onChange={(e) =>
                        setSwimmers(
                          swimmers.map((s) =>
                            s.id === swimmer.id ? { ...s, adaptive_notes: e.target.value } : s,
                          ),
                        )
                      }
                      placeholder="Anything Brielle should know — sensory needs, anxiety, medical notes…"
                    />
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-breeze-muted/80">
              If you change these notes, Brielle will be notified to review them.
            </p>
            <Button onClick={saveSwimmerNotes} disabled={saving}>
              Continue
            </Button>
          </>
        )}

        {current.key === 'policies' && (
          <>
            <ul className="text-sm portal-muted space-y-2 list-disc pl-5">
              <li>Lessons are Mon–Thu, 15 minutes, one-on-one.</li>
              <li>Missed lessons: contact Brielle as soon as possible.</li>
              <li>Weather: Brielle will email if the pool is closed.</li>
              <li>Payment is $90/week + $50 annual registration per swimmer.</li>
            </ul>
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={policiesOk}
                onChange={(e) => setPoliciesOk(e.target.checked)}
              />
              <span>I understand and agree to these lesson policies.</span>
            </label>
            <Button
              onClick={() => saveStep('policies')}
              disabled={!policiesOk || saving}
            >
              Continue
            </Button>
          </>
        )}

        {current.key === 'bring' && (
          <>
            <ul className="text-sm portal-muted space-y-2 list-disc pl-5">
              <li>Well-fitting swimsuit</li>
              <li>Towel</li>
              <li>Reusable swim diaper (infants/toddlers)</li>
              <li>Sunscreen</li>
              <li>Goggles optional for beginners</li>
            </ul>
            <Button onClick={() => saveStep('bring')} disabled={saving}>
              Continue
            </Button>
          </>
        )}

        {current.key === 'payment' && family && (
          <>
            <p className="text-sm portal-muted leading-relaxed">
              <strong>$90/week</strong> (four 15-min lessons, Mon–Thu) ·{' '}
              <strong>$50/year</strong> registration fee per swimmer.
            </p>
            <p className="text-sm portal-muted leading-relaxed">
              {family.zelle_instructions ||
                'Brielle accepts Zelle, cash, and Square. Payment details shared at your first lesson.'}
            </p>
            {profile.role === 'parent_guest' && (
              <p className="text-xs text-breeze-muted/80">Payment details are visible to the primary parent only.</p>
            )}
            <Button onClick={() => saveStep('payment')} disabled={saving}>
              Continue
            </Button>
          </>
        )}

        {current.key === 'prep' && (
          <>
            <ul className="text-sm portal-muted space-y-2 list-disc pl-5">
              <li>Arrive a few minutes early.</li>
              <li>Infants/toddlers: a parent or caregiver is usually in the water.</li>
              <li>Older swimmers may have lessons without a parent in the pool when ready.</li>
              <li>Lessons focus on survival skills — patience and safety first.</li>
            </ul>
            <Button onClick={() => saveStep('prep')} disabled={saving}>
              Continue
            </Button>
          </>
        )}

        {current.key === 'location' && family && (
          <>
            {family.pool_address ? (
              <>
                <p className="text-sm font-semibold text-breeze-deep">{family.pool_address}</p>
                {family.gate_instructions && (
                  <p className="text-sm portal-muted whitespace-pre-wrap">{family.gate_instructions}</p>
                )}
              </>
            ) : (
              <p className="text-sm portal-muted">
                Brielle will share the private pool address before your first lesson.
              </p>
            )}
            <p className="text-xs text-breeze-muted/80">This address is only visible to enrolled families.</p>
            <Button onClick={() => saveStep('location')} disabled={saving}>
              Finish setup
            </Button>
          </>
        )}

        {current.key === 'schedule' && (
          <>
            <p className="text-sm portal-muted">
              <strong>When:</strong> Monday–Thursday, 15 minutes per day
            </p>
            {swimmers.length === 0 ? (
              <p className="text-sm portal-muted">Brielle will confirm your lesson schedule.</p>
            ) : (
              <ul className="text-sm portal-muted space-y-4 mt-2">
                {swimmers.map((s) => {
                  const enrollment = enrollmentsBySwimmer[s.id]
                  return (
                    <li key={s.id}>
                      {swimmers.length > 1 && (
                        <p className="font-semibold text-breeze-deep mb-1">{s.name}</p>
                      )}
                      <p>
                        <strong>Time:</strong> {formatTime(enrollment?.lesson_time ?? null)}
                      </p>
                      <p>
                        <strong>Program:</strong>{' '}
                        {enrollment?.start_date
                          ? `${enrollment.start_date} – ${enrollment.end_date || 'ongoing'}`
                          : 'Dates confirmed with Brielle'}
                      </p>
                      <p>
                        <strong>Location:</strong>{' '}
                        {enrollment?.location === 'client_pool'
                          ? 'Your private pool'
                          : 'Bunnell (private pool)'}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
            <Button onClick={() => saveStep('schedule')} disabled={saving}>
              Continue to dashboard
            </Button>
          </>
        )}
      </Card>
    </PortalLayout>
  )
}
