import type { BillingModel } from './types'

export type { BillingModel }
export const WEEKLY_AMOUNT_CENTS = 9000
export const LESSON_AMOUNT_CENTS = 2250
export const REGISTRATION_AMOUNT_CENTS = 5000

export function billingModelLabel(model: BillingModel | null | undefined): string {
  if (model === 'per_lesson') return 'Per lesson ($22.50)'
  if (model === 'not_sure') return 'Not sure yet'
  return 'Weekly ($90)'
}

export function paymentDueLabel(payment: { due_date: string; amount_cents: number }): string {
  if (payment.amount_cents === LESSON_AMOUNT_CENTS) {
    return `Lesson · ${formatShortDate(payment.due_date)}`
  }
  if (payment.amount_cents === WEEKLY_AMOUNT_CENTS) {
    return `Week of ${payment.due_date}`
  }
  return `${formatShortDate(payment.due_date)} · ${payment.amount_cents / 100}`
}

export function formatShortDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function parentPricingSummary(model: BillingModel | null | undefined): string {
  if (model === 'per_lesson') {
    return '$22.50/lesson · $50/year registration'
  }
  if (model === 'not_sure') {
    return '$90/week or $22.50/lesson · Brielle will confirm'
  }
  return '$90/week · $50/year registration'
}
