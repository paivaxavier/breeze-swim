import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminNav } from '../../components/AdminNav'
import { PaymentSavedBanner } from '../../components/PaymentSavedBanner'
import { Button, Card, Input, LoadingState, PageTitle, PortalLayout, RecordPaymentButton, SectionTitle, StatCard } from '../../components/ui'
import { callEdgeFunction } from '../../lib/edge'
import {
  buildCsvRows,
  buildFamilyBalances,
  buildRecentPayments,
  computeFinanceSummary,
  downloadFinanceCsv,
  formatPaidDate,
  formatWeekLabel,
  methodTotals,
  mondayOf,
  recentWeekStarts,
  sumCents,
  addDays,
} from '../../lib/finance'
import { firstActiveSwimmerId, recordLessonPayment, recordWeeklyPayment } from '../../lib/payments'
import {
  deletePaymentRecord,
  deleteRegistrationFeeRecord,
  markPaymentDue,
  undoFinanceAction,
  type SavedFinanceAction,
} from '../../lib/paymentActions'
import { paymentDueLabel } from '../../lib/pricing'
import {
  ensureRegistrationFee,
  markRegistrationDue,
  markRegistrationPaid,
  registrationYear,
} from '../../lib/registrationFees'
import { supabase } from '../../lib/supabase'
import type { Family, Payment, PaymentMethod, RegistrationFee, Swimmer } from '../../lib/types'
import { PAYMENT_METHODS, formatCents } from '../../lib/types'

type DuePayment = Payment & { families: Pick<Family, 'primary_name' | 'primary_email'> }
type DueReg = RegistrationFee & { swimmers: Swimmer & { families: Pick<Family, 'primary_name'> } }
type FamilyOption = Pick<Family, 'id' | 'primary_name' | 'billing_model'>
type SwimmerOption = Pick<Swimmer, 'id' | 'name' | 'family_id'>

export function AdminPaymentsPage() {
  const [duePayments, setDuePayments] = useState<DuePayment[]>([])
  const [dueRegs, setDueRegs] = useState<DueReg[]>([])
  const [allPayments, setAllPayments] = useState<DuePayment[]>([])
  const [allRegs, setAllRegs] = useState<DueReg[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [method, setMethod] = useState<PaymentMethod>('zelle')
  const [ledgerWeek, setLedgerWeek] = useState(mondayOf())
  const [historyDays, setHistoryDays] = useState(30)
  const [families, setFamilies] = useState<FamilyOption[]>([])
  const [allSwimmers, setAllSwimmers] = useState<SwimmerOption[]>([])
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [addFamilyId, setAddFamilyId] = useState('')
  const [addType, setAddType] = useState<'weekly' | 'lesson' | 'registration'>('weekly')
  const [addWeek, setAddWeek] = useState(mondayOf())
  const [addLessonDate, setAddLessonDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [addSwimmerId, setAddSwimmerId] = useState('')
  const [markPaidNow, setMarkPaidNow] = useState(true)
  const [adding, setAdding] = useState(false)
  const [savedAction, setSavedAction] = useState<SavedFinanceAction | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [undoing, setUndoing] = useState(false)
  const addPaymentPanelRef = useRef<HTMLDivElement>(null)
  const recentPaymentsRef = useRef<HTMLDivElement>(null)
  const tuitionDueRef = useRef<HTMLDivElement>(null)

  function toggleAddPayment() {
    setShowAddPayment((open) => {
      const next = !open
      if (next) {
        window.setTimeout(() => {
          addPaymentPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }, 0)
      }
      return next
    })
    setError('')
  }

  async function load() {
    setLoading(true)
    const [{ data: due }, { data: regs }, { data: payments }, { data: registration }, { data: fams }, { data: swimmers }] =
      await Promise.all([
      supabase
        .from('payments')
        .select('*, families(primary_name, primary_email)')
        .eq('status', 'due')
        .order('due_date', { ascending: true }),
      supabase
        .from('registration_fees')
        .select('*, swimmers(name, family_id, families(primary_name))')
        .eq('status', 'due')
        .order('fee_year', { ascending: false }),
      supabase
        .from('payments')
        .select('*, families(primary_name, primary_email)')
        .order('due_date', { ascending: false }),
      supabase
        .from('registration_fees')
        .select('*, swimmers(name, family_id, families(primary_name))')
        .order('created_at', { ascending: false }),
      supabase.from('families').select('id, primary_name, billing_model').order('primary_name', { ascending: true }),
      supabase.from('swimmers').select('id, name, family_id').eq('status', 'active').order('name'),
    ])
    setDuePayments((due as DuePayment[]) || [])
    setDueRegs((regs as DueReg[]) || [])
    setAllPayments((payments as DuePayment[]) || [])
    setAllRegs((registration as DueReg[]) || [])
    setFamilies((fams as FamilyOption[]) || [])
    setAllSwimmers((swimmers as SwimmerOption[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const paidPayments = useMemo(
    () => allPayments.filter((p) => p.status === 'paid'),
    [allPayments],
  )
  const paidRegs = useMemo(() => allRegs.filter((r) => r.status === 'paid'), [allRegs])

  const summary = useMemo(
    () => computeFinanceSummary(duePayments, dueRegs, paidPayments, paidRegs),
    [duePayments, dueRegs, paidPayments, paidRegs],
  )

  const familyBalances = useMemo(
    () => buildFamilyBalances(duePayments, dueRegs),
    [duePayments, dueRegs],
  )

  const weekLedger = useMemo(() => {
    const weekEnd = addDays(ledgerWeek, 6)
    return allPayments.filter((p) => p.due_date >= ledgerWeek && p.due_date <= weekEnd)
  }, [allPayments, ledgerWeek])

  const weekLedgerPaid = weekLedger.filter((p) => p.status === 'paid')
  const weekLedgerDue = weekLedger.filter((p) => p.status === 'due')

  const historyCutoff = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - historyDays)
    return d.toISOString().slice(0, 10)
  }, [historyDays])

  const recentHistory = useMemo(() => {
    const weekly = paidPayments.filter((p) => p.paid_at && p.paid_at.slice(0, 10) >= historyCutoff)
    const regs = paidRegs.filter((r) => r.paid_at && r.paid_at.slice(0, 10) >= historyCutoff)
    return { weekly, regs }
  }, [paidPayments, paidRegs, historyCutoff])

  const historyMethodTotals = useMemo(
    () => methodTotals(recentHistory.weekly, recentHistory.regs),
    [recentHistory],
  )

  const recentPayments = useMemo(
    () => buildRecentPayments(paidPayments, paidRegs, 20),
    [paidPayments, paidRegs],
  )

  const swimmersForFamily = useMemo(
    () => allSwimmers.filter((s) => s.family_id === addFamilyId),
    [allSwimmers, addFamilyId],
  )

  function familyNameFor(id: string) {
    return families.find((f) => f.id === id)?.primary_name || 'Family'
  }

  function showSaved(action: SavedFinanceAction) {
    setSavedAction(action)
    setHighlightId(`${action.kind}-${action.id}`)
    setError('')
    setMessage('')
    setShowAddPayment(false)
    window.setTimeout(() => {
      const target = action.wasPaid ? recentPaymentsRef.current : tuitionDueRef.current
      target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
    window.setTimeout(() => setHighlightId(null), 4500)
  }

  async function undoSaved() {
    if (!savedAction) return
    setUndoing(true)
    setError('')
    const result = await undoFinanceAction(savedAction)
    if (result.error) setError(result.error)
    else {
      setSavedAction(null)
      setHighlightId(null)
      setMessage('Reverted.')
      await load()
    }
    setUndoing(false)
  }

  async function markPaymentUnpaid(paymentId: string) {
    setMarkingId(paymentId)
    setError('')
    const result = await markPaymentDue(paymentId)
    if (result.error) setError(result.error)
    else setMessage('Payment marked unpaid.')
    setMarkingId(null)
    await load()
  }

  async function removePayment(paymentId: string) {
    if (!window.confirm('Remove this charge? It will be deleted completely.')) return
    setMarkingId(paymentId)
    setError('')
    const result = await deletePaymentRecord(paymentId)
    if (result.error) setError(result.error)
    else setMessage('Charge removed.')
    setMarkingId(null)
    await load()
  }

  async function markRegUnpaid(regId: string) {
    setMarkingId(regId)
    setError('')
    const result = await markRegistrationDue(regId)
    if (result.error) setError(result.error)
    else setMessage('Registration marked unpaid.')
    setMarkingId(null)
    await load()
  }

  async function removeRegistration(regId: string) {
    if (!window.confirm('Remove this registration fee? It will be deleted completely.')) return
    setMarkingId(regId)
    setError('')
    const result = await deleteRegistrationFeeRecord(regId)
    if (result.error) setError(result.error)
    else setMessage('Registration fee removed.')
    setMarkingId(null)
    await load()
  }

  async function addPayment() {
    if (!addFamilyId) {
      setError('Choose a family.')
      return
    }
    setAdding(true)
    setError('')
    setMessage('')

    if (addType === 'weekly') {
      const swimmerId = await firstActiveSwimmerId(addFamilyId)
      const result = await recordWeeklyPayment({
        familyId: addFamilyId,
        swimmerId,
        weekStart: addWeek,
        markPaid: markPaidNow,
        method,
      })
      if (result.error) setError(result.error)
      else if (result.payment) {
        showSaved({
          kind: 'payment',
          id: result.payment.id,
          familyName: familyNameFor(addFamilyId),
          detail: paymentDueLabel(result.payment),
          amountCents: result.payment.amount_cents,
          wasPaid: markPaidNow,
        })
        await load()
      }
    } else if (addType === 'lesson') {
      const swimmerId = await firstActiveSwimmerId(addFamilyId)
      const result = await recordLessonPayment({
        familyId: addFamilyId,
        swimmerId,
        lessonDate: addLessonDate,
        markPaid: markPaidNow,
        method,
      })
      if (result.error) setError(result.error)
      else if (result.payment) {
        showSaved({
          kind: 'payment',
          id: result.payment.id,
          familyName: familyNameFor(addFamilyId),
          detail: paymentDueLabel(result.payment),
          amountCents: result.payment.amount_cents,
          wasPaid: markPaidNow,
        })
        await load()
      }
    } else {
      const swimmerId = addSwimmerId || swimmersForFamily[0]?.id
      if (!swimmerId) {
        setError('Choose a swimmer for registration.')
        setAdding(false)
        return
      }
      const year = registrationYear()
      const ensured = await ensureRegistrationFee(swimmerId, year)
      if (!ensured.fee) {
        setError(ensured.error || 'Could not create registration fee.')
        setAdding(false)
        return
      }
      if (markPaidNow) {
        const paid = await markRegistrationPaid(ensured.fee.id, method)
        if (paid.error) setError(paid.error)
        else if (paid.fee) {
          const swimmer = swimmersForFamily.find((s) => s.id === swimmerId)
          showSaved({
            kind: 'registration',
            id: paid.fee.id,
            familyName: familyNameFor(addFamilyId),
            detail: `${swimmer?.name || 'Swimmer'} · ${year} registration`,
            amountCents: paid.fee.amount_cents,
            wasPaid: true,
          })
          await load()
        }
      } else if (ensured.fee.status === 'paid') {
        setMessage('Registration fee already marked paid for this year.')
      } else {
        const swimmer = swimmersForFamily.find((s) => s.id === swimmerId)
        showSaved({
          kind: 'registration',
          id: ensured.fee.id,
          familyName: familyNameFor(addFamilyId),
          detail: `${swimmer?.name || 'Swimmer'} · ${year} registration`,
          amountCents: ensured.fee.amount_cents,
          wasPaid: false,
        })
        await load()
      }
    }
    setAdding(false)
  }

  async function generateWeek() {
    setGenerating(true)
    setError('')
    setMessage('')
    try {
      const result = await callEdgeFunction<{ created: number }>('generate-weekly-payments', {})
      setMessage(`Created ${result.created} weekly payment(s) for weekly-billing families.`)
      await load()
    } catch (e) {
      const { data, error: rpcError } = await supabase.rpc('generate_weekly_payments', {
        p_week_start: null,
      })
      if (rpcError) setError((e as Error).message)
      else {
        setMessage(`Created ${data} weekly payment(s) for weekly-billing families.`)
        await load()
      }
    }
    setGenerating(false)
  }

  async function markPaid(paymentId: string) {
    setMarkingId(paymentId)
    setError('')
    try {
      await callEdgeFunction('mark-payment-paid', { payment_id: paymentId, method })
      setMessage('Payment marked paid. Parent notified by email if Resend is configured.')
    } catch {
      const { error: rpcError } = await supabase.rpc('mark_payment_paid', {
        p_payment_id: paymentId,
        p_method: method,
        p_note: null,
      })
      if (rpcError) setError(rpcError.message)
      else setMessage('Payment marked paid.')
    }
    setMarkingId(null)
    await load()
  }

  async function markRegPaid(regId: string) {
    setMarkingId(regId)
    setError('')
    try {
      await callEdgeFunction('mark-payment-paid', { registration_id: regId, method })
      setMessage('Registration marked paid. Parent notified by email if Resend is configured.')
    } catch {
      const { error: rpcError } = await supabase.rpc('mark_registration_paid', {
        p_registration_id: regId,
        p_method: method,
        p_note: null,
      })
      if (rpcError) setError(rpcError.message)
      else setMessage('Registration marked paid.')
    }
    setMarkingId(null)
    await load()
  }

  function exportCsv() {
    const rows = buildCsvRows(allPayments, allRegs)
    downloadFinanceCsv(rows, `breeze-swim-finances-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  return (
    <PortalLayout title="Admin">
      <AdminNav />
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <PageTitle subtitle="Weekly ($90) or per-lesson ($22.50) · $50 registration per swimmer" className="!mb-0">
          Finances
        </PageTitle>
        <div className="flex flex-wrap gap-2 items-center shrink-0">
          <Button variant="secondary" onClick={exportCsv}>
            Export CSV
          </Button>
          <Button onClick={generateWeek} disabled={generating}>
            {generating ? 'Generating…' : 'Generate this week'}
          </Button>
        </div>
      </div>

      <Card ref={addPaymentPanelRef} className="text-left mb-6 relative z-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <SectionTitle className="mb-1">Add payment</SectionTitle>
            <p className="text-sm portal-muted">Weekly, per-lesson, or registration</p>
          </div>
          <RecordPaymentButton open={showAddPayment} onClick={toggleAddPayment} />
        </div>

        {showAddPayment && (
          <div className="mt-5 pt-5 border-t portal-divider space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-breeze-deep">Family</span>
              <select
                value={addFamilyId}
                onChange={(e) => {
                  const id = e.target.value
                  setAddFamilyId(id)
                  setAddSwimmerId('')
                  const fam = families.find((f) => f.id === id)
                  if (fam?.billing_model === 'per_lesson') setAddType('lesson')
                  else if (addType === 'lesson') setAddType('weekly')
                }}
                className="portal-input mt-1.5"
              >
                <option value="">Select family…</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.primary_name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="addType"
                  checked={addType === 'weekly'}
                  onChange={() => setAddType('weekly')}
                />
                Weekly ($90)
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="addType"
                  checked={addType === 'lesson'}
                  onChange={() => setAddType('lesson')}
                />
                Lesson ($22.50)
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="addType"
                  checked={addType === 'registration'}
                  onChange={() => setAddType('registration')}
                />
                Registration ($50)
              </label>
            </div>
            {addType === 'weekly' ? (
              <Input
                label="Week of (Monday)"
                type="date"
                value={addWeek}
                onChange={(e) => setAddWeek(e.target.value)}
              />
            ) : addType === 'lesson' ? (
              <Input
                label="Lesson date"
                type="date"
                value={addLessonDate}
                onChange={(e) => setAddLessonDate(e.target.value)}
              />
            ) : (
              <label className="block">
                <span className="text-sm font-semibold text-breeze-deep">Swimmer</span>
                <select
                  value={addSwimmerId || swimmersForFamily[0]?.id || ''}
                  onChange={(e) => setAddSwimmerId(e.target.value)}
                  className="portal-input mt-1.5"
                  disabled={!addFamilyId}
                >
                  {swimmersForFamily.length === 0 ? (
                    <option value="">No swimmers on file</option>
                  ) : (
                    swimmersForFamily.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={markPaidNow}
                onChange={(e) => setMarkPaidNow(e.target.checked)}
              />
              Mark as paid now
            </label>
            {markPaidNow && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-semibold text-breeze-deep">Method:</span>
                {PAYMENT_METHODS.map((m) => (
                  <label key={m.value} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="addMethod"
                      checked={method === m.value}
                      onChange={() => setMethod(m.value)}
                    />
                    {m.label}
                  </label>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                onClick={addPayment}
                disabled={adding || !addFamilyId || loading}
                className="!bg-gradient-to-r !from-breeze-gold !via-breeze-pink !to-breeze-sky !shadow-lg !shadow-breeze-pink/25 hover:!scale-[1.02] transition-transform"
              >
                {adding ? 'Saving…' : markPaidNow ? 'Save payment' : 'Add charge'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowAddPayment(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      {savedAction && (
        <PaymentSavedBanner
          action={savedAction}
          undoing={undoing}
          onUndo={undoSaved}
          onDismiss={() => setSavedAction(null)}
        />
      )}

      {message && !savedAction && <p className="text-sm text-green-700 mb-4">{message}</p>}
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <LoadingState />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="Outstanding"
              value={formatCents(summary.outstandingCents)}
              accent="var(--color-breeze-pink)"
            />
            <StatCard
              label="Collected this week"
              value={formatCents(summary.collectedThisWeekCents)}
              accent="var(--color-breeze-sky)"
            />
            <StatCard
              label="Collected this month"
              value={formatCents(summary.collectedThisMonthCents)}
              accent="var(--color-breeze-gold)"
            />
            <StatCard
              label="Year to date"
              value={formatCents(summary.collectedYtdCents)}
              accent="var(--color-breeze-deep)"
            />
          </div>

          <p className="text-sm portal-muted mb-4">
            {summary.familiesOwing} famil{summary.familiesOwing === 1 ? 'y' : 'ies'} with open balances
            {summary.registrationDueCents > 0 && (
              <> · {formatCents(summary.registrationDueCents)} in registration fees due</>
            )}
          </p>
        </>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="font-semibold text-breeze-deep">Mark paid via:</span>
        {PAYMENT_METHODS.map((m) => (
          <label key={m.value} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="method"
              checked={method === m.value}
              onChange={() => setMethod(m.value)}
            />
            {m.label}
          </label>
        ))}
      </div>

      <div className="space-y-6">
        <Card ref={recentPaymentsRef} className="text-left scroll-mt-24">
          <SectionTitle className="mb-4">Recent payments</SectionTitle>
          {recentPayments.length === 0 ? (
            <p className="text-sm portal-muted">
              No payments recorded yet.{' '}
              <button
                type="button"
                onClick={toggleAddPayment}
                className="font-bold text-breeze-deep underline decoration-breeze-pink/50 hover:text-breeze-pink"
              >
                + Add Payment
              </button>{' '}
              when you receive Zelle, cash, or Square.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recentPayments.map((item) => (
                <li
                  key={`${item.kind}-${item.id}`}
                  className={`flex flex-wrap items-center justify-between gap-3 border-b portal-divider pb-2 ${
                    highlightId === `${item.kind}-${item.id}` ? 'portal-finance-highlight' : ''
                  }`}
                >
                  <div>
                    <p className="font-semibold text-breeze-deep-dark">{item.familyName}</p>
                    <p className="portal-muted text-xs">
                      {item.detail} · {formatPaidDate(item.paidAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span className="text-green-600 font-semibold capitalize">
                      {item.method || 'paid'} · {formatCents(item.amountCents)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        item.kind === 'registration'
                          ? markRegUnpaid(item.id)
                          : markPaymentUnpaid(item.id)
                      }
                      disabled={markingId === item.id}
                      className="text-xs font-bold text-breeze-deep hover:text-breeze-pink disabled:opacity-50"
                    >
                      {markingId === item.id ? '…' : 'Mark unpaid'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {familyBalances.length > 0 && (
          <Card className="text-left">
            <SectionTitle className="mb-4">Who owes what</SectionTitle>
            <ul className="space-y-2">
              {familyBalances.map((balance) => (
                <li
                  key={balance.familyId}
                  className="flex flex-wrap items-center justify-between gap-3 border-b portal-divider pb-2 text-sm"
                >
                  <Link
                    to={`/admin/families/${balance.familyId}`}
                    className="font-semibold text-breeze-deep hover:text-breeze-sky"
                  >
                    {balance.familyName}
                  </Link>
                  <div className="text-right">
                    <p className="font-bold text-breeze-pink">{formatCents(balance.totalCents)}</p>
                    <p className="text-xs portal-muted">
                      {balance.weeklyCents > 0 && formatCents(balance.weeklyCents) + ' tuition'}
                      {balance.weeklyCents > 0 && balance.registrationCents > 0 && ' · '}
                      {balance.registrationCents > 0 &&
                        formatCents(balance.registrationCents) + ' registration'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="text-left">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <SectionTitle className="mb-0">Week ledger</SectionTitle>
            <select
              value={ledgerWeek}
              onChange={(e) => setLedgerWeek(e.target.value)}
              className="portal-input text-sm py-2 max-w-xs"
            >
              {recentWeekStarts(12).map((week) => (
                <option key={week} value={week}>
                  {formatWeekLabel(week)}
                </option>
              ))}
            </select>
          </div>

          {weekLedger.length === 0 ? (
            <p className="text-sm portal-muted">
              No ledger entries for this week.{' '}
              {ledgerWeek === mondayOf() && (
                <button
                  type="button"
                  onClick={generateWeek}
                  disabled={generating}
                  className="text-breeze-deep font-semibold hover:text-breeze-sky"
                >
                  Generate this week&apos;s payments
                </button>
              )}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-4 mb-4 text-sm">
                <span className="text-green-700 font-semibold">
                  Collected: {formatCents(sumCents(weekLedgerPaid))} ({weekLedgerPaid.length} paid)
                </span>
                <span className="text-breeze-pink font-semibold">
                  Still due: {formatCents(sumCents(weekLedgerDue))} ({weekLedgerDue.length} open)
                </span>
              </div>
              <ul className="space-y-2">
                {weekLedger.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b portal-divider pb-2 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-breeze-deep-dark">{p.families?.primary_name}</p>
                      <p className="portal-muted text-xs">
                        {paymentDueLabel(p)} · {formatCents(p.amount_cents)} ·{' '}
                        <span
                          className={
                            p.status === 'paid' ? 'text-green-600 font-semibold' : 'text-breeze-pink font-semibold'
                          }
                        >
                          {p.status === 'paid' ? `Paid · ${p.method}` : 'Due'}
                        </span>
                      </p>
                    </div>
                    {p.status === 'due' && (
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => markPaid(p.id)} disabled={markingId === p.id} className="!py-2 !px-4 text-xs">
                          {markingId === p.id ? 'Saving…' : 'Mark paid'}
                        </Button>
                        <button
                          type="button"
                          onClick={() => removePayment(p.id)}
                          disabled={markingId === p.id}
                          className="text-xs font-bold text-red-600 hover:text-red-700 self-center"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    {p.status === 'paid' && (
                      <button
                        type="button"
                        onClick={() => markPaymentUnpaid(p.id)}
                        disabled={markingId === p.id}
                        className="text-xs font-bold text-breeze-deep hover:text-breeze-pink"
                      >
                        Mark unpaid
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card ref={tuitionDueRef} className="text-left scroll-mt-24">
          <SectionTitle className="mb-4">All tuition due</SectionTitle>
          {duePayments.length === 0 ? (
            <p className="text-sm portal-muted">No lesson or weekly payments due.</p>
          ) : (
            <ul className="space-y-3">
              {duePayments.map((p) => (
                <li
                  key={p.id}
                  className={`flex flex-wrap items-center justify-between gap-3 border-b portal-divider pb-3 ${
                    highlightId === `payment-${p.id}` ? 'portal-finance-highlight' : ''
                  }`}
                >
                  <div>
                    <p className="font-semibold text-breeze-deep-dark">{p.families?.primary_name}</p>
                    <p className="text-sm portal-muted">
                      {paymentDueLabel(p)} · {formatCents(p.amount_cents)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to={`/admin/families/${p.family_id}`}
                      className="text-sm text-breeze-deep font-semibold self-center"
                    >
                      Profile
                    </Link>
                    <Button onClick={() => markPaid(p.id)} disabled={markingId === p.id}>
                      {markingId === p.id ? 'Saving…' : 'Mark paid'}
                    </Button>
                    <button
                      type="button"
                      onClick={() => removePayment(p.id)}
                      disabled={markingId === p.id}
                      className="text-sm font-bold text-red-600 hover:text-red-700 self-center"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="text-left">
          <SectionTitle className="mb-4">Registration fees due</SectionTitle>
          {dueRegs.length === 0 ? (
            <p className="text-sm portal-muted">No registration fees due.</p>
          ) : (
            <ul className="space-y-3">
              {dueRegs.map((r) => (
                <li
                  key={r.id}
                  className={`flex flex-wrap items-center justify-between gap-3 border-b portal-divider pb-3 ${
                    highlightId === `registration-${r.id}` ? 'portal-finance-highlight' : ''
                  }`}
                >
                  <div>
                    <p className="font-semibold text-breeze-deep-dark">
                      {r.swimmers?.name} · {r.swimmers?.families?.primary_name}
                    </p>
                    <p className="text-sm portal-muted">
                      {r.fee_year} registration · {formatCents(r.amount_cents)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => markRegPaid(r.id)} disabled={markingId === r.id}>
                      {markingId === r.id ? 'Saving…' : 'Mark paid'}
                    </Button>
                    <button
                      type="button"
                      onClick={() => removeRegistration(r.id)}
                      disabled={markingId === r.id}
                      className="text-sm font-bold text-red-600 hover:text-red-700 self-center"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="text-left">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <SectionTitle className="mb-0">Payment history</SectionTitle>
            <select
              value={historyDays}
              onChange={(e) => setHistoryDays(Number(e.target.value))}
              className="portal-input text-sm py-2"
            >
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
            </select>
          </div>

          {historyMethodTotals.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-4">
              {historyMethodTotals.map((item) => (
                <span
                  key={item.method}
                  className="rounded-full bg-breeze-foam-water border border-breeze-sky/20 px-3 py-1 text-xs font-bold text-breeze-deep capitalize"
                >
                  {item.method}: {formatCents(item.cents)}
                </span>
              ))}
            </div>
          )}

          {recentHistory.weekly.length === 0 && recentHistory.regs.length === 0 ? (
            <p className="text-sm portal-muted">No payments in this period.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recentHistory.weekly.map((p) => (
                <li key={p.id} className="flex justify-between gap-3 border-b portal-divider pb-2">
                  <span>
                    {p.families?.primary_name} · week of {p.due_date}
                  </span>
                  <span className="text-green-600 font-semibold capitalize shrink-0">
                    {p.method} · {formatCents(p.amount_cents)}
                  </span>
                </li>
              ))}
              {recentHistory.regs.map((r) => (
                <li key={r.id} className="flex justify-between gap-3 border-b portal-divider pb-2">
                  <span>
                    {r.swimmers?.name} · {r.fee_year} registration
                  </span>
                  <span className="text-green-600 font-semibold capitalize shrink-0">
                    {r.method} · {formatCents(r.amount_cents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PortalLayout>
  )
}