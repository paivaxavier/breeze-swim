import { supabase } from './supabase'
import type { PaymentMethod, RegistrationFee } from './types'

export const REGISTRATION_AMOUNT_CENTS = 5000

export function registrationYear(date = new Date()) {
  return date.getFullYear()
}

export function feeForYear(fees: RegistrationFee[] | undefined, year: number) {
  return fees?.find((fee) => Number(fee.fee_year) === year)
}

export function isRegistrationPaid(fee: RegistrationFee | undefined) {
  return fee?.status === 'paid'
}

export async function ensureRegistrationFee(
  swimmerId: string,
  year = registrationYear(),
): Promise<{ fee: RegistrationFee | null; error: string | null }> {
  const { data: existing, error: existingErr } = await supabase
    .from('registration_fees')
    .select('*')
    .eq('swimmer_id', swimmerId)
    .eq('fee_year', year)
    .maybeSingle()

  if (existingErr) {
    return { fee: null, error: existingErr.message }
  }
  if (existing) return { fee: existing as RegistrationFee, error: null }

  const { data: created, error: insErr } = await supabase
    .from('registration_fees')
    .insert({
      swimmer_id: swimmerId,
      fee_year: year,
      amount_cents: REGISTRATION_AMOUNT_CENTS,
      status: 'due',
    })
    .select()
    .single()

  if (created) return { fee: created as RegistrationFee, error: null }

  if (insErr) {
    const { data: rpcData, error: rpcError } = await supabase.rpc('ensure_registration_fee', {
      p_swimmer_id: swimmerId,
      p_year: year,
    })
    if (rpcData) return { fee: rpcData as RegistrationFee, error: null }

    const { data: retry } = await supabase
      .from('registration_fees')
      .select('*')
      .eq('swimmer_id', swimmerId)
      .eq('fee_year', year)
      .maybeSingle()
    if (retry) return { fee: retry as RegistrationFee, error: null }

    return {
      fee: null,
      error:
        insErr.message ||
        rpcError?.message ||
        'Registration fees table not found. Run migrations 004 and 007 in Supabase SQL editor.',
    }
  }

  return { fee: null, error: 'Could not create registration fee.' }
}

export async function markRegistrationPaid(
  feeId: string,
  method: PaymentMethod,
): Promise<{ fee: RegistrationFee | null; error: string | null }> {
  const { data: updated, error: upErr } = await supabase
    .from('registration_fees')
    .update({
      status: 'paid',
      method,
      paid_at: new Date().toISOString(),
    })
    .eq('id', feeId)
    .select()
    .single()

  if (updated) {
    return { fee: updated as RegistrationFee, error: null }
  }

  const { data, error } = await supabase.rpc('mark_registration_paid', {
    p_registration_id: feeId,
    p_method: method,
    p_note: null,
  })
  if (data) return { fee: data as RegistrationFee, error: null }

  const { data: existing } = await supabase
    .from('registration_fees')
    .select('*')
    .eq('id', feeId)
    .maybeSingle()
  if (existing?.status === 'paid') {
    return { fee: existing as RegistrationFee, error: null }
  }

  return { fee: null, error: upErr?.message || error?.message || 'Could not mark registration paid' }
}

export async function markRegistrationDue(
  feeId: string,
): Promise<{ fee: RegistrationFee | null; error: string | null }> {
  const { data: updated, error: upErr } = await supabase
    .from('registration_fees')
    .update({
      status: 'due',
      method: null,
      paid_at: null,
      note: null,
    })
    .eq('id', feeId)
    .select()
    .single()

  if (updated) return { fee: updated as RegistrationFee, error: null }

  const { data, error } = await supabase.rpc('mark_registration_due', {
    p_registration_id: feeId,
  })
  if (data) return { fee: data as RegistrationFee, error: null }

  return { fee: null, error: upErr?.message || error?.message || 'Could not mark registration unpaid' }
}

export async function loadRegistrationFeesForSwimmers(swimmerIds: string[]) {
  if (!swimmerIds.length) return {}

  const { data, error } = await supabase
    .from('registration_fees')
    .select('*')
    .in('swimmer_id', swimmerIds)
    .order('fee_year', { ascending: false })

  if (error) throw new Error(error.message)

  const feesMap: Record<string, RegistrationFee[]> = {}
  for (const swimmerId of swimmerIds) {
    feesMap[swimmerId] = []
  }
  for (const fee of (data as RegistrationFee[]) || []) {
    if (!feesMap[fee.swimmer_id]) feesMap[fee.swimmer_id] = []
    feesMap[fee.swimmer_id].push(fee)
  }
  return feesMap
}

export function upsertFeeInMap(
  feesMap: Record<string, RegistrationFee[]>,
  swimmerId: string,
  fee: RegistrationFee,
) {
  const next = { ...feesMap }
  const swimmerFees = [...(next[swimmerId] || [])]
  const index = swimmerFees.findIndex((item) => item.id === fee.id)
  if (index >= 0) swimmerFees[index] = fee
  else swimmerFees.unshift(fee)
  next[swimmerId] = swimmerFees
  return next
}
