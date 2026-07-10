import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const logoSrc = `${import.meta.env.BASE_URL}logo.png`

export function PortalLogo({ className = '' }: { className?: string }) {
  return (
    <img src={logoSrc} alt="Breeze Swim" className={`portal-logo ${className}`} width={200} height={180} />
  )
}

export function PortalLayout({
  children,
  title,
}: {
  children: React.ReactNode
  title?: string
}) {
  const { profile, signOut } = useAuth()

  return (
    <div className="portal-shell">
      <header className="portal-header sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-5 py-3 sm:py-3.5 flex items-center justify-between gap-4">
          <Link to="/" className="shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-breeze-sky/50">
            <PortalLogo />
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {title && (
              <span className="text-breeze-muted hidden sm:inline font-semibold">{title}</span>
            )}
            {profile?.role === 'admin' && (
              <Link
                to="/admin"
                className="rounded-full bg-breeze-foam-water px-3 py-1.5 text-breeze-deep font-bold hover:bg-breeze-sky/15 transition-colors"
              >
                Admin
              </Link>
            )}
            {profile && (
              <button
                type="button"
                onClick={() => signOut()}
                className="text-breeze-muted hover:text-breeze-pink font-semibold transition-colors"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-5 py-8">{children}</main>
    </div>
  )
}

export function PageTitle({
  children,
  subtitle,
  className = '',
}: {
  children: React.ReactNode
  subtitle?: string
  className?: string
}) {
  return (
    <div className={`mb-6 ${className}`}>
      <h1 className="text-2xl sm:text-3xl font-display portal-page-title">{children}</h1>
      {subtitle && <p className="text-sm text-breeze-muted mt-1.5">{subtitle}</p>}
    </div>
  )
}

export function SectionTitle({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return <h2 className={`portal-section-title mb-3 ${className}`}>{children}</h2>
}

export function LoadingState({ children = 'Loading…' }: { children?: React.ReactNode }) {
  return <Card className="text-center portal-muted">{children}</Card>
}

export function StatCard({
  label,
  value,
  accent = 'var(--color-breeze-sky)',
}: {
  label: string
  value: React.ReactNode
  accent?: string
}) {
  return (
    <div className="portal-card portal-stat rounded-2xl p-5 text-left" style={{ ['--stat-accent' as string]: accent }}>
      <p className="text-xs font-bold uppercase tracking-widest text-breeze-muted">{label}</p>
      <p className="text-3xl font-display text-breeze-deep-dark mt-1">{value}</p>
    </div>
  )
}

export function RecordPaymentButton({
  open,
  onClick,
  className = '',
}: {
  open: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick()
      }}
      aria-expanded={open}
      className={`portal-record-payment-btn shrink-0 relative z-20 ${open ? 'portal-record-payment-btn--open' : ''} ${className}`}
    >
      {open ? (
        'Close'
      ) : (
        <>
          <span className="portal-record-payment-btn__icon" aria-hidden>
            +
          </span>
          <span>Add Payment</span>
          <span className="portal-record-payment-btn__sparkle" aria-hidden>
            ✨
          </span>
        </>
      )}
    </button>
  )
}

export const Card = forwardRef<
  HTMLDivElement,
  {
    children: React.ReactNode
    className?: string
  }
>(function Card({ children, className = '' }, ref) {
  return (
    <div ref={ref} className={`portal-card rounded-2xl p-6 ${className}`}>
      {children}
    </div>
  )
})

export function Button({
  children,
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-colors disabled:opacity-50'
  const styles = {
    primary: 'bg-breeze-pink text-white hover:bg-breeze-coral',
    secondary:
      'bg-white text-breeze-deep border-2 border-breeze-sky/30 hover:border-breeze-sky',
    ghost: 'text-breeze-deep hover:text-breeze-sky',
  }
  return (
    <button type={type} className={`${base} ${styles[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

export function Input({
  label,
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block text-left">
      <span className="text-sm font-semibold text-breeze-deep">{label}</span>
      <input
        className={`mt-1.5 w-full rounded-xl border-2 border-breeze-sky/20 bg-white px-4 py-2.5 text-sm text-breeze-deep focus:border-breeze-sky focus:outline-none focus:ring-2 focus:ring-breeze-sky/20 ${className}`}
        {...props}
      />
    </label>
  )
}

export function Textarea({
  label,
  className = '',
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="block text-left">
      <span className="text-sm font-semibold text-breeze-deep">{label}</span>
      <textarea
        className={`mt-1.5 w-full rounded-xl border-2 border-breeze-sky/20 bg-white px-4 py-2.5 text-sm text-breeze-deep focus:border-breeze-sky focus:outline-none focus:ring-2 focus:ring-breeze-sky/20 ${className}`}
        rows={4}
        {...props}
      />
    </label>
  )
}

export function ConfigBanner() {
  if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) return null
  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 text-left">
      Supabase is not configured. Copy <code className="font-mono">.env.example</code> to{' '}
      <code className="font-mono">.env.local</code> in the portal folder and add your project keys.
      See <code className="font-mono">PORTAL.md</code> in the repo root.
    </div>
  )
}

export function ErrorNotice({ message }: { message: string }) {
  return (
      <div
        role="alert"
        className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 text-left"
      >
      {message}
    </div>
  )
}

export function MagicLinkSentNotice({
  email,
  onTryDifferentEmail,
}: {
  email: string
  onTryDifferentEmail?: () => void
}) {
  return (
    <div className="text-left space-y-4" role="status" aria-live="polite">
      <div className="rounded-xl border-2 border-breeze-sky/25 bg-breeze-foam-water px-4 py-4">
        <p className="font-display text-lg text-breeze-deep-dark mb-1">Login link sent</p>
        <p className="text-sm text-breeze-muted leading-relaxed">
          We emailed a secure sign-in link to <strong>{email}</strong>. Open it on this device to
          continue.
        </p>
      </div>
      <ul className="text-sm portal-muted space-y-1.5 list-disc pl-5">
        <li>It may take a minute to arrive.</li>
        <li>Check spam or promotions if you don&apos;t see it.</li>
        <li>The link expires after a short time — you can request another below.</li>
      </ul>
      {onTryDifferentEmail && (
        <Button variant="ghost" onClick={onTryDifferentEmail}>
          Use a different email
        </Button>
      )}
    </div>
  )
}
