import { supabase } from './supabase'
import { LESSON_AMOUNT_CENTS, WEEKLY_AMOUNT_CENTS } from './pricing'
import type { Payment, PaymentMethod } from './types'

export { WEEKLY_AMOUNT_CENTS, LESSON_AMOUNT_CENTS } from './pricing'

export async function recordFamilyPayment(opts: {
  familyId: string
  swimmerId?: string | null
  dueDate: string
  amountCents: number
  markPaid: boolean
  method?: PaymentMethod
  note?: string | null
}): Promise<{ payment: Payment | null; error: string | null }> {
  const payload = {
    family_id: opts.familyId,
    swimmer_id: opts.swimmerId ?? null,
    due_date: opts.dueDate,
    amount_cents: opts.amountCents,
    status: opts.markPaid ? ('paid' as const) : ('due' as const),
    method: opts.markPaid ? (opts.method ?? 'zelle') : null,
    paid_at: opts.markPaid ? new Date().toISOString() : null,
    note: opts.note ?? null,
  }

  const { data: inserted, error: insErr } = await supabase
    .from('payments')
    .insert(payload)
    .select()
    .single()

  if (inserted) return { payment: inserted as Payment, error: null }

  if (insErr?.code === '23505') {
    const { data: updated, error: upErr } = await supabase
      .from('payments')
      .update({
        amount_cents: payload.amount_cents,
        status: payload.status,
        method: payload.method,
        paid_at: payload.paid_at,
        swimmer_id: payload.swimmer_id,
        note: payload.note,
      })
      .eq('family_id', opts.familyId)
      .eq('due_date', opts.dueDate)
      .select()
      .single()
    if (updated) return { payment: updated as Payment, error: null }
    return { payment: null, error: upErr?.message || insErr.message }
  }

  return { payment: null, error: insErr?.message || 'Could not record payment' }
}

export async function recordWeeklyPayment(opts: {
  familyId: string
  swimmerId?: string | null
  weekStart: string
  amountCents?: number
  markPaid: boolean
  method?: PaymentMethod
}): Promise<{ payment: Payment | null; error: string | null }> {
  return recordFamilyPayment({
    familyId: opts.familyId,
    swimmerId: opts.swimmerId,
    dueDate: opts.weekStart,
    amountCents: opts.amountCents ?? WEEKLY_AMOUNT_CENTS,
    markPaid: opts.markPaid,
    method: opts.method,
  })
}

export async function recordLessonPayment(opts: {
  familyId: string
  swimmerId?: string | null
  lessonDate: string
  markPaid: boolean
  method?: PaymentMethod
}): Promise<{ payment: Payment | null; error: string | null }> {
  return recordFamilyPayment({
    familyId: opts.familyId,
    swimmerId: opts.swimmerId,
    dueDate: opts.lessonDate,
    amountCents: LESSON_AMOUNT_CENTS,
    markPaid: opts.markPaid,
    method: opts.method,
    note: 'per_lesson',
  })
}

export async function firstActiveSwimmerId(familyId: string): Promise<string | null> {
  const { data } = await supabase
    .from('swimmers')
    .select('id')
    .eq('family_id', familyId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}
