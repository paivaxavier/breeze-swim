import { LESSON_AMOUNT_CENTS, paymentDueLabel } from './pricing'
import type { Payment, PaymentMethod, RegistrationFee } from './types'
export { paymentDueLabel } from './pricing'
import { formatCents } from './types'

export function mondayOf(date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return toDateString(d)
}

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function startOfMonth(date = new Date()): string {
  return toDateString(new Date(date.getFullYear(), date.getMonth(), 1))
}

export function startOfYear(date = new Date()): string {
  return toDateString(new Date(date.getFullYear(), 0, 1))
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + days)
  return toDateString(d)
}

export function formatWeekLabel(weekStart: string): string {
  const end = addDays(weekStart, 3)
  const start = new Date(`${weekStart}T12:00:00`)
  const endDate = new Date(`${end}T12:00:00`)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `Week of ${start.toLocaleDateString(undefined, opts)} – ${endDate.toLocaleDateString(undefined, opts)}`
}

export function recentWeekStarts(count = 10): string[] {
  const current = mondayOf()
  const weeks: string[] = []
  for (let i = 0; i < count; i++) {
    weeks.push(addDays(current, -7 * i))
  }
  return weeks
}

export function sumCents(items: { amount_cents: number }[]): number {
  return items.reduce((sum, item) => sum + item.amount_cents, 0)
}

export function paidOnOrAfter(paidAt: string | null, startDate: string): boolean {
  if (!paidAt) return false
  return paidAt.slice(0, 10) >= startDate
}

export function paidBefore(paidAt: string | null, endDate: string): boolean {
  if (!paidAt) return false
  return paidAt.slice(0, 10) <= endDate
}

export type FinanceSummary = {
  outstandingCents: number
  weeklyDueCents: number
  registrationDueCents: number
  collectedThisWeekCents: number
  collectedThisMonthCents: number
  collectedYtdCents: number
  familiesOwing: number
}

export function computeFinanceSummary(
  duePayments: Payment[],
  dueRegs: RegistrationFee[],
  paidPayments: Payment[],
  paidRegs: RegistrationFee[],
): FinanceSummary {
  const weekStart = mondayOf()
  const weekEnd = addDays(weekStart, 6)
  const monthStart = startOfMonth()
  const yearStart = startOfYear()

  const weeklyDueCents = sumCents(duePayments)
  const registrationDueCents = sumCents(dueRegs)
  const outstandingCents = weeklyDueCents + registrationDueCents

  const paidWeeklyInRange = (start: string, end?: string) =>
    paidPayments
      .filter((p) => paidOnOrAfter(p.paid_at, start) && (!end || paidBefore(p.paid_at, end)))
      .reduce((sum, p) => sum + p.amount_cents, 0)

  const paidRegsInRange = (start: string, end?: string) =>
    paidRegs
      .filter((r) => paidOnOrAfter(r.paid_at, start) && (!end || paidBefore(r.paid_at, end)))
      .reduce((sum, r) => sum + r.amount_cents, 0)

  const collectedThisWeekCents =
    paidWeeklyInRange(weekStart, weekEnd) + paidRegsInRange(weekStart, weekEnd)
  const collectedThisMonthCents =
    paidWeeklyInRange(monthStart) + paidRegsInRange(monthStart)
  const collectedYtdCents = paidWeeklyInRange(yearStart) + paidRegsInRange(yearStart)

  return {
    outstandingCents,
    weeklyDueCents,
    registrationDueCents,
    collectedThisWeekCents,
    collectedThisMonthCents,
    collectedYtdCents,
    familiesOwing: new Set(duePayments.map((p) => p.family_id)).size,
  }
}

export type FamilyBalance = {
  familyId: string
  familyName: string
  totalCents: number
  weeklyCents: number
  registrationCents: number
}

export function buildFamilyBalances(
  duePayments: Array<Payment & { families?: { primary_name: string } | null }>,
  dueRegs: Array<
    RegistrationFee & { swimmers?: { name: string; family_id: string; families?: { primary_name: string } | null } | null }
  >,
): FamilyBalance[] {
  const map = new Map<string, FamilyBalance>()

  for (const payment of duePayments) {
    const existing = map.get(payment.family_id) || {
      familyId: payment.family_id,
      familyName: payment.families?.primary_name || 'Family',
      totalCents: 0,
      weeklyCents: 0,
      registrationCents: 0,
    }
    existing.weeklyCents += payment.amount_cents
    existing.totalCents += payment.amount_cents
    map.set(payment.family_id, existing)
  }

  for (const reg of dueRegs) {
    const familyId = reg.swimmers?.family_id
    if (!familyId) continue
    const existing = map.get(familyId) || {
      familyId,
      familyName: reg.swimmers?.families?.primary_name || 'Family',
      totalCents: 0,
      weeklyCents: 0,
      registrationCents: 0,
    }
    existing.registrationCents += reg.amount_cents
    existing.totalCents += reg.amount_cents
    if (!map.has(familyId)) {
      existing.familyName = reg.swimmers?.families?.primary_name || existing.familyName
    }
    map.set(familyId, existing)
  }

  return [...map.values()].sort((a, b) => b.totalCents - a.totalCents)
}

export type MethodTotal = { method: PaymentMethod; cents: number }

export function methodTotals(
  paidPayments: Payment[],
  paidRegs: RegistrationFee[],
  since?: string,
): MethodTotal[] {
  const totals = new Map<PaymentMethod, number>()

  for (const payment of paidPayments) {
    if (!payment.method || !payment.paid_at) continue
    if (since && !paidOnOrAfter(payment.paid_at, since)) continue
    totals.set(payment.method, (totals.get(payment.method) || 0) + payment.amount_cents)
  }
  for (const reg of paidRegs) {
    if (!reg.method || !reg.paid_at) continue
    if (since && !paidOnOrAfter(reg.paid_at, since)) continue
    totals.set(reg.method, (totals.get(reg.method) || 0) + reg.amount_cents)
  }

  return [...totals.entries()]
    .map(([method, cents]) => ({ method, cents }))
    .sort((a, b) => b.cents - a.cents)
}

type CsvRow = {
  type: string
  family: string
  detail: string
  dueDate: string
  amountCents: number
  status: string
  method: string
  paidDate: string
}

export function downloadFinanceCsv(rows: CsvRow[], filename: string) {
  const header = ['Type', 'Family', 'Detail', 'Due date', 'Amount', 'Status', 'Method', 'Paid date']
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [
        csvEscape(row.type),
        csvEscape(row.family),
        csvEscape(row.detail),
        row.dueDate,
        (row.amountCents / 100).toFixed(2),
        row.status,
        row.method,
        row.paidDate,
      ].join(','),
    ),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function buildCsvRows(
  payments: Array<Payment & { families?: { primary_name: string } | null }>,
  regs: Array<
    RegistrationFee & { swimmers?: { name: string; families?: { primary_name: string } | null } | null }
  >,
): CsvRow[] {
  const paymentRows: CsvRow[] = payments.map((p) => ({
    type: 'Weekly',
    family: p.families?.primary_name || '',
    detail: `Week of ${p.due_date}`,
    dueDate: p.due_date,
    amountCents: p.amount_cents,
    status: p.status,
    method: p.method || '',
    paidDate: p.paid_at ? p.paid_at.slice(0, 10) : '',
  }))
  const regRows: CsvRow[] = regs.map((r) => ({
    type: 'Registration',
    family: r.swimmers?.families?.primary_name || '',
    detail: `${r.swimmers?.name || 'Swimmer'} · ${r.fee_year}`,
    dueDate: `${r.fee_year}`,
    amountCents: r.amount_cents,
    status: r.status,
    method: r.method || '',
    paidDate: r.paid_at ? r.paid_at.slice(0, 10) : '',
  }))
  return [...paymentRows, ...regRows]
}

export function formatMoney(cents: number): string {
  return formatCents(cents)
}

export type RecentPaymentItem = {
  id: string
  kind: 'weekly' | 'lesson' | 'registration'
  familyName: string
  detail: string
  amountCents: number
  method: string | null
  paidAt: string
}

export function buildRecentPayments(
  paidPayments: Array<Payment & { families?: { primary_name: string } | null }>,
  paidRegs: Array<
    RegistrationFee & {
      swimmers?: { name: string; families?: { primary_name: string } | null } | null
    }
  >,
  limit = 20,
): RecentPaymentItem[] {
  const rows: RecentPaymentItem[] = []

  for (const payment of paidPayments) {
    if (!payment.paid_at) continue
    const isLesson = payment.amount_cents === LESSON_AMOUNT_CENTS
    rows.push({
      id: payment.id,
      kind: isLesson ? 'lesson' : 'weekly',
      familyName: payment.families?.primary_name || 'Family',
      detail: isLesson ? paymentDueLabel(payment) : `Week of ${payment.due_date}`,
      amountCents: payment.amount_cents,
      method: payment.method,
      paidAt: payment.paid_at,
    })
  }

  for (const reg of paidRegs) {
    if (!reg.paid_at) continue
    rows.push({
      id: reg.id,
      kind: 'registration',
      familyName: reg.swimmers?.families?.primary_name || 'Family',
      detail: `${reg.swimmers?.name || 'Swimmer'} · ${reg.fee_year} registration`,
      amountCents: reg.amount_cents,
      method: reg.method,
      paidAt: reg.paid_at,
    })
  }

  return rows
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
    .slice(0, limit)
}

export function formatPaidDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
