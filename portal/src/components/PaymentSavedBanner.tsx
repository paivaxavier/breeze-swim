import { Button } from './ui'
import type { SavedFinanceAction } from '../lib/paymentActions'
import { undoButtonLabel } from '../lib/paymentActions'
import { formatCents } from '../lib/types'

export function PaymentSavedBanner({
  action,
  undoing,
  onUndo,
  onDismiss,
}: {
  action: SavedFinanceAction
  undoing?: boolean
  onUndo: () => void
  onDismiss: () => void
}) {
  return (
    <div
      className="mb-6 rounded-2xl border-2 border-green-300/80 bg-gradient-to-r from-green-50 via-emerald-50/90 to-breeze-foam-water p-5 shadow-md shadow-green-200/30"
      role="status"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-widest text-green-800">Payment saved</p>
          <p className="text-lg font-display text-breeze-deep-dark mt-1">
            {action.familyName} · {formatCents(action.amountCents)}
          </p>
          <p className="text-sm text-breeze-deep mt-0.5">
            {action.detail}
            {action.wasPaid ? ' · marked paid' : ' · added as due'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button type="button" variant="secondary" onClick={onUndo} disabled={undoing}>
            {undoing ? 'Undoing…' : undoButtonLabel(action)}
          </Button>
          <button
            type="button"
            onClick={onDismiss}
            className="text-sm font-semibold text-breeze-muted hover:text-breeze-deep px-2 py-2"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
