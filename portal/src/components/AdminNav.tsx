import { Link, useLocation } from 'react-router-dom'

const links = [
  { to: '/admin', label: 'Today', exact: true },
  { to: '/admin/payments', label: 'Finances' },
  { to: '/admin/families', label: 'Families' },
  { to: '/admin/email', label: 'Send email' },
]

export function AdminNav() {
  const { pathname } = useLocation()

  return (
    <nav className="flex flex-wrap gap-2 mb-6 p-1.5 rounded-2xl bg-white/70 border-2 border-breeze-sky/15">
      {links.map((link) => {
        const active = link.exact ? pathname === link.to : pathname.startsWith(link.to)
        return (
          <Link
            key={link.to}
            to={link.to}
            className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
              active
                ? 'bg-gradient-to-r from-breeze-pink to-breeze-coral text-white shadow-md shadow-breeze-pink/20'
                : 'text-breeze-deep hover:bg-breeze-foam-water'
            }`}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
