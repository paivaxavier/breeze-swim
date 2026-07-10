import { supabase } from './supabase'
import { markRegistrationDue } from './registrationFees'
import type { Payment } from './types'

export type SavedFinanceAction = {
  kind: 'payment' | 'registration'
  id: string
  familyName: string
  detail: string
  amountCents: number
  wasPaid: boolean
}

export async function markPaymentDue(
  paymentId: string,
): Promise<{ payment: Payment | null; error: string | null }> {
  const { data: updated, error: upErr } = await supabase
    .from('payments')
    .update({
      status: 'due',
      method: null,
      paid_at: null,
    })
    .eq('id', paymentId)
    .select()
    .single()

  if (updated) return { payment: updated as Payment, error: null }

  const { data, error } = await supabase.rpc('mark_payment_due', {
    p_payment_id: paymentId,
  })
  if (data) return { payment: data as Payment, error: null }

  return { payment: null, error: upErr?.message || error?.message || 'Could not mark payment unpaid' }
}

export async function deletePaymentRecord(paymentId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('payments').delete().eq('id', paymentId)
  return { error: error?.message || null }
}

export async function deleteRegistrationFeeRecord(feeId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('registration_fees').delete().eq('id', feeId)
  return { error: error?.message || null }
}

export async function undoFinanceAction(
  action: SavedFinanceAction,
): Promise<{ error: string | null }> {
  if (action.wasPaid) {
    if (action.kind === 'payment') {
      const result = await markPaymentDue(action.id)
      return { error: result.error }
    }
    const result = await markRegistrationDue(action.id)
    return { error: result.error }
  }

  if (action.kind === 'payment') {
    return deletePaymentRecord(action.id)
  }
  return deleteRegistrationFeeRecord(action.id)
}

export function undoButtonLabel(action: SavedFinanceAction): string {
  return action.wasPaid ? 'Undo (mark unpaid)' : 'Undo (remove)'
}
