import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AdminNav } from '../../components/AdminNav'
import { PaymentSavedBanner } from '../../components/PaymentSavedBanner'
import { Button, Card, ErrorNotice, Input, PageTitle, PortalLayout, SectionTitle, Textarea } from '../../components/ui'
import { inviteUrl, supabase } from '../../lib/supabase'
import {
  REGISTRATION_AMOUNT_CENTS,
  ensureRegistrationFee,
  feeForYear,
  isRegistrationPaid,
  loadRegistrationFeesForSwimmers,
  markRegistrationDue,
  markRegistrationPaid,
  registrationYear,
  upsertFeeInMap,
} from '../../lib/registrationFees'
import { recordLessonPayment } from '../../lib/payments'
import {
  deletePaymentRecord,
  deleteRegistrationFeeRecord,
  undoFinanceAction,
  type SavedFinanceAction,
} from '../../lib/paymentActions'
import { billingModelLabel, paymentDueLabel } from '../../lib/pricing'
import { LESSON_TIME_OPTIONS, formatLessonTime } from '../../lib/schedule'
import { useAuth } from '../../context/AuthContext'
import type { Enrollment, Family, FamilyInvite, Payment, PaymentMethod, RegistrationFee, Swimmer } from '../../lib/types'
import { PAYMENT_METHODS, formatCents } from '../../lib/types'

type SwimmerFormRow = {
  key: string
  swimmer: Partial<Swimmer>
  enrollment: Partial<Enrollment>
}

function newSwimmerRow(): SwimmerFormRow {
  return {
    key: `new-${crypto.randomUUID()}`,
    swimmer: { name: '', adaptive_notes: '' },
    enrollment: { lesson_time: '16:00', location: 'bunnell', program_weeks: 6 },
  }
}

function LessonTimeSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const current = value.slice(0, 5) || '16:00'
  const options = LESSON_TIME_OPTIONS.some((o) => o.value === current)
    ? LESSON_TIME_OPTIONS
    : [{ value: current, label: formatLessonTime(current) }, ...LESSON_TIME_OPTIONS]

  return (
    <label className="block">
      <span className="text-sm font-semibold text-breeze-deep">Lesson time</span>
      <select value={current} onChange={(e) => onChange(e.target.value)} className="portal-input">
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function AdminFamilyFormPage() {
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const { user } = useAuth()
  const [family, setFamily] = useState<Partial<Family>>({
    primary_name: '',
    primary_email: '',
    primary_phone: '',
    is_returning: false,
    billing_model: 'weekly',
    pool_address: '',
    gate_instructions: '',
    zelle_instructions: '',
  })
  const [swimmerRows, setSwimmerRows] = useState<SwimmerFormRow[]>([newSwimmerRow()])
  const [loadedSwimmerIds, setLoadedSwimmerIds] = useState<string[]>([])
  const [registrationFeesBySwimmer, setRegistrationFeesBySwimmer] = useState<
    Record<string, RegistrationFee[]>
  >({})
  const [familyBalanceCents, setFamilyBalanceCents] = useState(0)
  const [familyDuePayments, setFamilyDuePayments] = useState<Payment[]>([])
  const [familyDueRegs, setFamilyDueRegs] = useState<
    Array<RegistrationFee & { swimmerName: string }>
  >([])
  const [invites, setInvites] = useState<FamilyInvite[]>([])
  const [guestEmail, setGuestEmail] = useState('')
  const [lastLink, setLastLink] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [regMethod, setRegMethod] = useState<PaymentMethod>('zelle')
  const [markingRegId, setMarkingRegId] = useState<string | null>(null)
  const [lessonDate, setLessonDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [loggingLesson, setLoggingLesson] = useState(false)
  const [savedAction, setSavedAction] = useState<SavedFinanceAction | null>(null)
  const [undoing, setUndoing] = useState(false)
  const [revertingId, setRevertingId] = useState<string | null>(null)

  const currentYear = registrationYear()

  function activeSwimmerIds() {
    return swimmerRows.map((row) => row.swimmer.id).filter(Boolean) as string[]
  }

  function swimmerNameMap() {
    return Object.fromEntries(
      swimmerRows
        .filter((row) => row.swimmer.id)
        .map((row) => [row.swimmer.id!, row.swimmer.name || 'Swimmer']),
    )
  }

  function currentYearFee(fees: RegistrationFee[] | undefined) {
    return feeForYear(fees, currentYear)
  }

  function applyBalanceFromFees(
    feesMap: Record<string, RegistrationFee[]>,
    swimmerIds: string[],
    duePayments: Payment[],
    names: Record<string, string>,
  ) {
    const dueRegs: Array<RegistrationFee & { swimmerName: string }> = []
    let registrationDueCents = 0

    for (const swimmerId of swimmerIds) {
      const fee = currentYearFee(feesMap[swimmerId])
      if (!fee || fee.status === 'due') {
        const amount = fee?.amount_cents ?? REGISTRATION_AMOUNT_CENTS
        registrationDueCents += amount
        dueRegs.push({
          id: fee?.id || `pending-${swimmerId}`,
          swimmer_id: swimmerId,
          fee_year: currentYear,
          amount_cents: amount,
          status: 'due',
          method: null,
          paid_at: null,
          note: null,
          swimmerName: names[swimmerId] || 'Swimmer',
        })
      }
    }

    const weeklyDueCents = duePayments.reduce((sum, p) => sum + p.amount_cents, 0)
    setFamilyDuePayments(duePayments)
    setFamilyDueRegs(dueRegs)
    setFamilyBalanceCents(weeklyDueCents + registrationDueCents)
  }

  async function loadRegistrationFees(
    swimmerIds: string[],
    ensureMissing = false,
    previousMap: Record<string, RegistrationFee[]> = registrationFeesBySwimmer,
  ) {
    if (ensureMissing) {
      for (const swimmerId of swimmerIds) {
        const { error } = await ensureRegistrationFee(swimmerId, currentYear)
        if (error) setError(error)
      }
    }
    try {
      const feesMap = await loadRegistrationFeesForSwimmers(swimmerIds)
      setRegistrationFeesBySwimmer(feesMap)
      return feesMap
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load registration fees'
      setError(message)
      return previousMap
    }
  }

  async function refreshRegistrationAndBalance(
    swimmerIds: string[],
    swimmerNames: Record<string, string> = {},
    ensureMissing = false,
  ) {
    if (!id || id === 'new') return

    const feesMap = await loadRegistrationFees(swimmerIds, ensureMissing)

    const { data: duePay, error: duePayErr } = await supabase
      .from('payments')
      .select('*')
      .eq('family_id', id)
      .eq('status', 'due')
      .order('due_date', { ascending: true })

    if (duePayErr) setError(duePayErr.message)
    applyBalanceFromFees(
      feesMap,
      swimmerIds,
      (duePay as Payment[]) || [],
      swimmerNames,
    )
  }

  async function handleRegistrationStatus(
    swimmerId: string,
    fee: RegistrationFee | undefined,
    paid: boolean,
  ) {
    setMarkingRegId(swimmerId)
    setError('')
    setMessage('')

    let activeFee = fee
    if (!activeFee) {
      const ensured = await ensureRegistrationFee(swimmerId, currentYear)
      if (!ensured.fee) {
        setError(ensured.error || 'Could not load registration fee.')
        setMarkingRegId(null)
        return
      }
      activeFee = ensured.fee
    }

    const result = paid
      ? await markRegistrationPaid(activeFee.id, regMethod)
      : await markRegistrationDue(activeFee.id)

    if (!result.fee) {
      setError(result.error || 'Update failed.')
      setMarkingRegId(null)
      return
    }

    setMessage(paid ? 'Registration marked paid.' : 'Registration marked as due.')

    const swimmerIds = activeSwimmerIds()
    const names = swimmerNameMap()
    let nextFeesMap = registrationFeesBySwimmer
    setRegistrationFeesBySwimmer((prev) => {
      nextFeesMap = upsertFeeInMap(prev, swimmerId, result.fee!)
      return nextFeesMap
    })
    applyBalanceFromFees(nextFeesMap, swimmerIds, familyDuePayments, names)
    setMarkingRegId(null)
  }

  async function logLessonPayment(markPaid: boolean) {
    if (!id || id === 'new') return
    setLoggingLesson(true)
    setError('')
    setMessage('')
    const swimmerId = activeSwimmerIds()[0] || null
    const result = await recordLessonPayment({
      familyId: id,
      swimmerId,
      lessonDate,
      markPaid,
      method: regMethod,
    })
    if (result.error) {
      setError(result.error)
    } else if (result.payment) {
      setSavedAction({
        kind: 'payment',
        id: result.payment.id,
        familyName: family.primary_name || 'Family',
        detail: paymentDueLabel(result.payment),
        amountCents: result.payment.amount_cents,
        wasPaid: markPaid,
      })
      setMessage('')
      const swimmerIds = activeSwimmerIds()
      const names = swimmerNameMap()
      await refreshRegistrationAndBalance(swimmerIds, names, true)
    }
    setLoggingLesson(false)
  }

  async function undoSaved() {
    if (!savedAction) return
    setUndoing(true)
    setError('')
    const result = await undoFinanceAction(savedAction)
    if (result.error) setError(result.error)
    else {
      setSavedAction(null)
      setMessage('Reverted.')
      const swimmerIds = activeSwimmerIds()
      const names = swimmerNameMap()
      await refreshRegistrationAndBalance(swimmerIds, names, true)
    }
    setUndoing(false)
  }

  async function removeFamilyDuePayment(paymentId: string) {
    if (!window.confirm('Remove this charge? It will be deleted completely.')) return
    setRevertingId(paymentId)
    setError('')
    const result = await deletePaymentRecord(paymentId)
    if (result.error) setError(result.error)
    else {
      setMessage('Charge removed.')
      await refreshRegistrationAndBalance(activeSwimmerIds(), swimmerNameMap(), true)
    }
    setRevertingId(null)
  }

  async function removeFamilyDueReg(regId: string) {
    if (!window.confirm('Remove this registration fee? It will be deleted completely.')) return
    setRevertingId(regId)
    setError('')
    const result = await deleteRegistrationFeeRecord(regId)
    if (result.error) setError(result.error)
    else {
      setMessage('Registration fee removed.')
      await refreshRegistrationAndBalance(activeSwimmerIds(), swimmerNameMap(), true)
    }
    setRevertingId(null)
  }

  function updateSwimmer(index: number, patch: Partial<Swimmer>) {
    setSwimmerRows((rows) =>
      rows.map((row, i) => (i === index ? { ...row, swimmer: { ...row.swimmer, ...patch } } : row)),
    )
  }

  function updateEnrollment(index: number, patch: Partial<Enrollment>) {
    setSwimmerRows((rows) =>
      rows.map((row, i) =>
        i === index ? { ...row, enrollment: { ...row.enrollment, ...patch } } : row,
      ),
    )
  }

  function addSwimmerRow() {
    setSwimmerRows((rows) => [...rows, newSwimmerRow()])
  }

  function removeSwimmerRow(index: number) {
    if (swimmerRows.length <= 1) return
    setSwimmerRows((rows) => rows.filter((_, i) => i !== index))
  }

  useEffect(() => {
    if (isNew || !id) return
    async function load() {
      const { data: fam } = await supabase.from('families').select('*').eq('id', id!).single()
      if (fam) setFamily(fam as Family)

      const { data: swList } = await supabase
        .from('swimmers')
        .select('*, enrollments(*)')
        .eq('family_id', id!)
        .order('created_at', { ascending: true })

      const swimmers = (swList || []) as (Swimmer & { enrollments: Enrollment[] | Enrollment | null })[]
      const swimmerIds = swimmers.map((sw) => sw.id)
      const swimmerNames = Object.fromEntries(swimmers.map((sw) => [sw.id, sw.name]))
      if (swimmers.length) {
        setSwimmerRows(
          swimmers.map((sw) => {
            const enr = Array.isArray(sw.enrollments)
              ? sw.enrollments[0]
              : sw.enrollments || undefined
            return {
              key: sw.id,
              swimmer: sw,
              enrollment: enr || { lesson_time: '16:00', location: 'bunnell', program_weeks: 6 },
            }
          }),
        )
        setLoadedSwimmerIds(swimmerIds)
      }

      await refreshRegistrationAndBalance(swimmerIds, swimmerNames, true)

      const { data: inv } = await supabase
        .from('family_invites')
        .select('*')
        .eq('family_id', id!)
        .order('created_at', { ascending: false })
      setInvites((inv as FamilyInvite[]) || [])
    }
    load()
  }, [id, isNew])

  async function saveSwimmerRow(familyId: string, row: SwimmerFormRow) {
    const name = row.swimmer.name?.trim()
    if (!name) return

    if (row.swimmer.id) {
      await supabase
        .from('swimmers')
        .update({
          name,
          adaptive_notes: row.swimmer.adaptive_notes || null,
        })
        .eq('id', row.swimmer.id)

      if (row.enrollment.id) {
        await supabase
          .from('enrollments')
          .update({
            lesson_time: row.enrollment.lesson_time || null,
            start_date: row.enrollment.start_date || null,
            end_date: row.enrollment.end_date || null,
            location: row.enrollment.location || 'bunnell',
            program_weeks: row.enrollment.program_weeks || 6,
          })
          .eq('id', row.enrollment.id)
      } else {
        await supabase.from('enrollments').insert({
          swimmer_id: row.swimmer.id,
          lesson_time: row.enrollment.lesson_time || null,
          location: row.enrollment.location || 'bunnell',
          program_weeks: row.enrollment.program_weeks || 6,
          start_date: row.enrollment.start_date || null,
          end_date: row.enrollment.end_date || null,
        })
      }
      return
    }

    const { data: sw, error: swErr } = await supabase
      .from('swimmers')
      .insert({
        family_id: familyId,
        name,
        adaptive_notes: row.swimmer.adaptive_notes || null,
        status: 'active',
      })
      .select()
      .single()
    if (swErr || !sw) throw new Error(swErr?.message || 'Could not create swimmer')

    await supabase.from('enrollments').insert({
      swimmer_id: sw.id,
      lesson_time: row.enrollment.lesson_time || null,
      location: row.enrollment.location || 'bunnell',
      program_weeks: row.enrollment.program_weeks || 6,
      start_date: row.enrollment.start_date || null,
      end_date: row.enrollment.end_date || null,
    })
    await ensureRegistrationFee(sw.id, currentYear)
  }

  async function saveFamily() {
    setSaving(true)
    setError('')
    const rowsToSave = swimmerRows.filter((row) => row.swimmer.name?.trim())

    if (isNew) {
      if (!rowsToSave.length) {
        setError('Add at least one swimmer name.')
        setSaving(false)
        return
      }
      const { data: created, error: famErr } = await supabase
        .from('families')
        .insert({
          primary_name: family.primary_name!,
          primary_email: family.primary_email!,
          primary_phone: family.primary_phone || null,
          is_returning: family.is_returning || false,
          billing_model: family.billing_model || 'weekly',
          pool_address: family.pool_address || null,
          gate_instructions: family.gate_instructions || null,
          zelle_instructions: family.zelle_instructions || null,
        })
        .select()
        .single()
      if (famErr || !created) {
        setError(famErr?.message || 'Could not create family')
        setSaving(false)
        return
      }
      try {
        for (const row of rowsToSave) {
          await saveSwimmerRow(created.id, row)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create swimmer')
        setSaving(false)
        return
      }
      setSaving(false)
      navigate(`/admin/families/${created.id}`)
      return
    }

    const { error: upErr } = await supabase
      .from('families')
      .update({
        primary_name: family.primary_name,
        primary_email: family.primary_email,
        primary_phone: family.primary_phone || null,
        is_returning: family.is_returning,
        billing_model: family.billing_model || 'weekly',
        pool_address: family.pool_address || null,
        gate_instructions: family.gate_instructions || null,
        zelle_instructions: family.zelle_instructions || null,
        notes_edit_pending: false,
      })
      .eq('id', id!)
    if (upErr) {
      setError(upErr.message)
      setSaving(false)
      return
    }

    const currentIds = rowsToSave.map((row) => row.swimmer.id).filter(Boolean) as string[]
    const toDelete = loadedSwimmerIds.filter((sid) => !currentIds.includes(sid))
    for (const sid of toDelete) {
      await supabase.from('swimmers').delete().eq('id', sid)
    }

    try {
      for (const row of rowsToSave) {
        await saveSwimmerRow(id!, row)
      }
      setLoadedSwimmerIds(currentIds)
      setMessage('Saved.')
      const names = Object.fromEntries(
        rowsToSave.filter((r) => r.swimmer.id).map((r) => [r.swimmer.id!, r.swimmer.name || 'Swimmer']),
      )
      await refreshRegistrationAndBalance(currentIds, names, true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save swimmers')
    }
    setSaving(false)
  }

  async function createInvite(email: string, role: 'primary' | 'guest') {
    if (!id || id === 'new') {
      setError('Save the family first.')
      return
    }
    setError('')
    setMessage('')
    const { data, error: invErr } = await supabase
      .from('family_invites')
      .insert({
        family_id: id,
        email: email.trim().toLowerCase(),
        invite_role: role,
        invited_by: user?.id || null,
      })
      .select()
      .single()
    if (invErr || !data) {
      setError(invErr?.message || 'Could not create invite')
      return
    }

    const link = inviteUrl(data.token)
    setLastLink(link)
    setInvites((prev) => [data as FamilyInvite, ...prev])

    const fnUrl = import.meta.env.VITE_SUPABASE_URL
    if (fnUrl) {
      const { data: session } = await supabase.auth.getSession()
      await fetch(`${fnUrl}/functions/v1/send-family-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({ invite_id: data.id, invite_url: link }),
      }).catch(() => null)
    }

    setMessage(role === 'primary' ? 'Login invite created. Share the link or check email.' : 'Caregiver invite created.')
  }

  async function resendInvite(inv: FamilyInvite) {
    const link = inviteUrl(inv.token)
    setLastLink(link)
    setMessage('Invite link ready — copy below or check email.')

    const fnUrl = import.meta.env.VITE_SUPABASE_URL
    if (fnUrl) {
      const { data: session } = await supabase.auth.getSession()
      await fetch(`${fnUrl}/functions/v1/send-family-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({ invite_id: inv.id, invite_url: link }),
      }).catch(() => null)
    }
  }

  return (
    <PortalLayout title="Admin">
      <AdminNav />
      <Link to="/admin/families" className="text-sm text-breeze-deep font-semibold hover:text-breeze-sky">
        ← All families
      </Link>
      <PageTitle className="mt-4">
        {isNew ? 'Add family' : family.primary_name || 'Family'}
      </PageTitle>

      {savedAction && (
        <PaymentSavedBanner
          action={savedAction}
          undoing={undoing}
          onUndo={undoSaved}
          onDismiss={() => setSavedAction(null)}
        />
      )}

      <div className="space-y-6">
        {!isNew && (
          <Card className="text-left">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest portal-muted">Balance due</p>
                <p
                  className={`text-3xl font-display mt-1 ${
                    familyBalanceCents > 0 ? 'text-breeze-pink' : 'text-green-600'
                  }`}
                >
                  {familyBalanceCents > 0 ? formatCents(familyBalanceCents) : '$0 Due'}
                </p>
              </div>
              <Link
                to="/admin/payments"
                className="text-sm text-breeze-deep font-semibold hover:text-breeze-sky"
              >
                Open finances →
              </Link>
            </div>
            {(familyDuePayments.length > 0 || familyDueRegs.length > 0) && (
              <ul className="mt-4 pt-4 border-t portal-divider text-sm space-y-1">
                {familyDuePayments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 portal-muted">
                    <span>{paymentDueLabel(p)}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-breeze-deep">{formatCents(p.amount_cents)}</span>
                      <button
                        type="button"
                        onClick={() => removeFamilyDuePayment(p.id)}
                        disabled={revertingId === p.id}
                        className="text-xs font-bold text-red-600 hover:text-red-700"
                      >
                        {revertingId === p.id ? '…' : 'Remove'}
                      </button>
                    </div>
                  </li>
                ))}
                {familyDueRegs.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 portal-muted">
                    <span>
                      {r.swimmerName} · {r.fee_year} registration
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-breeze-deep">{formatCents(r.amount_cents)}</span>
                      <button
                        type="button"
                        onClick={() => removeFamilyDueReg(r.id)}
                        disabled={revertingId === r.id}
                        className="text-xs font-bold text-red-600 hover:text-red-700"
                      >
                        {revertingId === r.id ? '…' : 'Remove'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {!isNew && swimmerRows.some((row) => row.swimmer.id) && (
          <Card className="text-left space-y-4">
            <SectionTitle className="mb-0">Registration ({currentYear})</SectionTitle>
            <p className="text-sm portal-muted">$50 annual fee per swimmer.</p>
            {error && <ErrorNotice message={error} />}
            {message && <p className="text-sm text-green-700">{message}</p>}
            <div className="flex flex-wrap items-center gap-3 text-sm pb-2 border-b portal-divider">
              <span className="font-semibold text-breeze-deep">When marking paid, record as:</span>
              {PAYMENT_METHODS.map((m) => (
                <label key={m.value} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="regMethod"
                    checked={regMethod === m.value}
                    onChange={() => setRegMethod(m.value)}
                  />
                  {m.label}
                </label>
              ))}
            </div>
            <ul className="space-y-3">
              {swimmerRows
                .filter((row) => row.swimmer.id)
                .map((row) => {
                  const swimmerId = row.swimmer.id!
                  const fees = registrationFeesBySwimmer[swimmerId] || []
                  const currentFee = currentYearFee(fees)
                  const isPaid = isRegistrationPaid(currentFee)
                  const busy = markingRegId === swimmerId

                  return (
                    <li
                      key={swimmerId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-breeze-sky/15 bg-breeze-foam-water/40 px-4 py-3"
                    >
                      <div>
                        <p className="font-semibold text-breeze-deep-dark">{row.swimmer.name}</p>
                        <p className="text-sm portal-muted">
                          {formatCents(currentFee?.amount_cents ?? REGISTRATION_AMOUNT_CENTS)} ·{' '}
                          <span
                            className={
                              isPaid ? 'text-green-600 font-semibold' : 'text-breeze-pink font-semibold'
                            }
                          >
                            {isPaid
                              ? `Paid${currentFee?.method ? ` via ${currentFee.method}` : ''}`
                              : 'Due'}
                          </span>
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          type="button"
                          variant="secondary"
                          className="!py-2 !px-4 text-xs"
                          disabled={busy || !isPaid}
                          onClick={() => void handleRegistrationStatus(swimmerId, currentFee, false)}
                        >
                          {busy && isPaid ? 'Saving…' : 'Mark unpaid'}
                        </Button>
                        <Button
                          type="button"
                          className="!py-2 !px-4 text-xs"
                          disabled={busy || isPaid}
                          onClick={() => void handleRegistrationStatus(swimmerId, currentFee, true)}
                        >
                          {busy && !isPaid ? 'Saving…' : 'Mark paid'}
                        </Button>
                      </div>
                    </li>
                  )
                })}
            </ul>
          </Card>
        )}

        <Card className="text-left space-y-4">
          <SectionTitle className="mb-0">Family</SectionTitle>
          <Input
            label="Parent name"
            value={family.primary_name || ''}
            onChange={(e) => setFamily({ ...family, primary_name: e.target.value })}
          />
          <Input
            label="Email"
            type="email"
            value={family.primary_email || ''}
            onChange={(e) => setFamily({ ...family, primary_email: e.target.value })}
          />
          <Input
            label="Phone"
            value={family.primary_phone || ''}
            onChange={(e) => setFamily({ ...family, primary_phone: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={family.is_returning || false}
              onChange={(e) => setFamily({ ...family, is_returning: e.target.checked })}
            />
            Returning / former student (short welcome flow)
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-breeze-deep">How they pay for lessons</span>
            <select
              value={family.billing_model || 'weekly'}
              onChange={(e) =>
                setFamily({
                  ...family,
                  billing_model: e.target.value as Family['billing_model'],
                })
              }
              className="portal-input mt-1.5"
            >
              <option value="weekly">{billingModelLabel('weekly')}</option>
              <option value="per_lesson">{billingModelLabel('per_lesson')}</option>
              <option value="not_sure">{billingModelLabel('not_sure')}</option>
            </select>
            <p className="text-xs portal-muted mt-1.5">
              {family.billing_model === 'per_lesson'
                ? 'Per-lesson families are skipped when you generate weekly charges. Log each lesson at $22.50.'
                : family.billing_model === 'not_sure'
                  ? 'No automatic weekly charges until you pick weekly or per-lesson.'
                  : 'Weekly families get a $90 charge when you generate the week.'}
            </p>
          </label>
          {!isNew && family.billing_model === 'per_lesson' && (
            <div className="rounded-xl border-2 border-breeze-sky/15 bg-breeze-foam-water/40 p-4 space-y-3">
              <p className="text-sm font-semibold text-breeze-deep">Log a lesson</p>
              <Input
                label="Lesson date"
                type="date"
                value={lessonDate}
                onChange={(e) => setLessonDate(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => logLessonPayment(true)} disabled={loggingLesson}>
                  {loggingLesson ? 'Saving…' : 'Mark lesson paid'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => logLessonPayment(false)}
                  disabled={loggingLesson}
                >
                  Add as due
                </Button>
              </div>
            </div>
          )}
          <Textarea
            label="Pool address (portal only)"
            value={family.pool_address || ''}
            onChange={(e) => setFamily({ ...family, pool_address: e.target.value })}
          />
          <Textarea
            label="Gate / arrival instructions"
            value={family.gate_instructions || ''}
            onChange={(e) => setFamily({ ...family, gate_instructions: e.target.value })}
          />
          <Textarea
            label="Zelle / payment instructions"
            value={family.zelle_instructions || ''}
            onChange={(e) => setFamily({ ...family, zelle_instructions: e.target.value })}
          />
        </Card>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle className="mb-0">Swimmers</SectionTitle>
            <Button type="button" variant="secondary" onClick={addSwimmerRow}>
              + Add swimmer
            </Button>
          </div>

          {swimmerRows.map((row, index) => (
            <Card key={row.key} className="text-left space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-breeze-deep">
                  {swimmerRows.length > 1 ? `Swimmer ${index + 1}` : 'Swimmer'}
                </p>
                {swimmerRows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSwimmerRow(index)}
                    className="text-xs font-bold text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>
              <Input
                label="Name"
                value={row.swimmer.name || ''}
                onChange={(e) => updateSwimmer(index, { name: e.target.value })}
              />
              <Textarea
                label="Adaptive notes"
                value={row.swimmer.adaptive_notes || ''}
                onChange={(e) => updateSwimmer(index, { adaptive_notes: e.target.value })}
              />
              <LessonTimeSelect
                value={row.enrollment.lesson_time?.slice(0, 5) || '16:00'}
                onChange={(lesson_time) => updateEnrollment(index, { lesson_time })}
              />
              <label className="block">
                <span className="text-sm font-semibold text-breeze-deep">Lesson pool</span>
                <select
                  value={row.enrollment.location || 'bunnell'}
                  onChange={(e) =>
                    updateEnrollment(index, {
                      location: e.target.value as 'bunnell' | 'client_pool',
                    })
                  }
                  className="portal-input"
                >
                  <option value="bunnell">Bunnell pool</option>
                  <option value="client_pool">Client private pool</option>
                </select>
              </label>
              <div className="grid sm:grid-cols-2 gap-4">
                <Input
                  label="Program start"
                  type="date"
                  value={row.enrollment.start_date || ''}
                  onChange={(e) => updateEnrollment(index, { start_date: e.target.value })}
                />
                <Input
                  label="Program end"
                  type="date"
                  value={row.enrollment.end_date || ''}
                  onChange={(e) => updateEnrollment(index, { end_date: e.target.value })}
                />
              </div>
            </Card>
          ))}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-green-700">{message}</p>}

        <div className="flex flex-wrap gap-3">
          <Button onClick={saveFamily} disabled={saving}>
            {saving ? 'Saving…' : 'Save family'}
          </Button>
          {!isNew && family.primary_email && (
            <Button
              variant="secondary"
              onClick={() => createInvite(family.primary_email!, 'primary')}
            >
              Send login
            </Button>
          )}
        </div>

        {!isNew && (
          <Card className="text-left space-y-4">
            <SectionTitle className="mb-0">Caregiver login</SectionTitle>
            <p className="text-sm portal-muted">
              Guest logins can see schedule and messages — not payment info.
            </p>
            <div className="flex gap-2 flex-wrap">
              <input
                type="email"
                placeholder="caregiver@email.com"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                className="portal-input flex-1 min-w-[200px]"
              />
              <Button
                variant="secondary"
                onClick={() => createInvite(guestEmail, 'guest')}
                disabled={!guestEmail}
              >
                Add caregiver login
              </Button>
            </div>

            {lastLink && (
              <div className="rounded-xl bg-breeze-foam-water border-2 border-breeze-sky/20 p-4 text-sm break-all">
                <p className="font-semibold text-breeze-deep mb-1">Latest invite link (copy & text if email fails):</p>
                <code className="text-xs">{lastLink}</code>
              </div>
            )}

            {invites.length > 0 && (
              <ul className="text-sm space-y-2">
                {invites.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap justify-between gap-2 border-b portal-divider pb-2">
                    <span>
                      {inv.email}{' '}
                      <span className="text-breeze-muted/70">({inv.invite_role})</span>
                    </span>
                    <div className="flex items-center gap-3">
                      <span className={inv.accepted_at ? 'text-green-600' : 'text-breeze-deep'}>
                        {inv.accepted_at ? 'Active' : 'Pending'}
                      </span>
                      {!inv.accepted_at && (
                        <button
                          type="button"
                          onClick={() => resendInvite(inv)}
                          className="text-xs font-bold text-breeze-deep hover:text-breeze-sky"
                        >
                          Resend
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </PortalLayout>
  )
}
