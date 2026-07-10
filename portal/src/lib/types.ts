export type UserRole = 'admin' | 'parent_primary' | 'parent_guest'
export type WelcomeType = 'full' | 'short'
export type BillingModel = 'weekly' | 'per_lesson' | 'not_sure'

export interface Profile {
  id: string
  role: UserRole
  family_id: string | null
  full_name: string | null
  phone: string | null
  welcome_type: WelcomeType | null
  welcome_completed_at: string | null
}

export interface Family {
  id: string
  primary_name: string
  primary_email: string
  primary_phone: string | null
  pool_address: string | null
  gate_instructions: string | null
  zelle_instructions: string | null
  is_returning: boolean
  billing_model?: BillingModel
  notes_edit_pending: boolean
  admin_notes: string | null
  created_at: string
}

export interface Swimmer {
  id: string
  family_id: string
  name: string
  date_of_birth: string | null
  status: 'active' | 'former' | 'waitlist'
  adaptive_notes: string | null
}

export interface Enrollment {
  id: string
  swimmer_id: string
  start_date: string | null
  end_date: string | null
  lesson_time: string | null
  location: 'bunnell' | 'client_pool'
  program_weeks: number | null
}

export interface FamilyInvite {
  id: string
  family_id: string
  email: string
  token: string
  invite_role: 'primary' | 'guest'
  accepted_at: string | null
  created_at: string
}

export const FULL_WELCOME_STEPS = [
  { key: 'contact', title: 'Confirm your contact info' },
  { key: 'swimmer', title: 'Confirm swimmer details' },
  { key: 'policies', title: 'Lesson policies' },
  { key: 'bring', title: 'What to bring' },
  { key: 'payment', title: 'How to pay' },
  { key: 'prep', title: 'First lesson prep' },
  { key: 'location', title: 'Pool location' },
] as const

export const SHORT_WELCOME_STEPS = [
  { key: 'contact', title: 'Confirm your contact info' },
  { key: 'schedule', title: 'Confirm your schedule' },
] as const

export type PaymentMethod = 'zelle' | 'cash' | 'square'
export type PaymentStatus = 'due' | 'paid' | 'waived'
export type MessageType =
  | 'announcement'
  | 'payment_due'
  | 'payment_received'
  | 'lesson_reminder'
  | 'custom'

export interface Payment {
  id: string
  family_id: string
  swimmer_id: string | null
  due_date: string
  amount_cents: number
  status: PaymentStatus
  method: PaymentMethod | null
  paid_at: string | null
  note: string | null
  created_at: string
}

export interface RegistrationFee {
  id: string
  swimmer_id: string
  fee_year: number
  amount_cents: number
  status: PaymentStatus
  method: PaymentMethod | null
  paid_at: string | null
  note: string | null
}

export interface Message {
  id: string
  family_id: string | null
  message_type: MessageType
  subject: string
  body: string
  created_at: string
}

export interface AdminNotification {
  id: string
  family_id: string
  notification_type: string
  message: string
  read_at: string | null
  created_at: string
}

export function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`
}

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'zelle', label: 'Zelle' },
  { value: 'cash', label: 'Cash' },
  { value: 'square', label: 'Square' },
]
