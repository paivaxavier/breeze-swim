import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminNav } from '../../components/AdminNav'
import { Card, LoadingState, PageTitle, PortalLayout } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import type { Family, FamilyInvite } from '../../lib/types'

type FamilyRow = Family & {
  swimmers: { name: string }[]
  invites: Pick<FamilyInvite, 'email' | 'accepted_at' | 'invite_role'>[]
}

function inviteStatus(family: FamilyRow) {
  const primaryInvite = family.invites.find((i) => i.invite_role === 'primary')
  if (!primaryInvite) return { label: 'Not invited', tone: 'text-breeze-muted/70' }
  if (primaryInvite.accepted_at) return { label: 'Active', tone: 'text-green-600' }
  return { label: 'Invite sent', tone: 'text-breeze-deep' }
}

export function AdminFamiliesPage() {
  const [families, setFamilies] = useState<FamilyRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: fams } = await supabase.from('families').select('*').order('created_at', {
        ascending: false,
      })
      if (!fams?.length) {
        setLoading(false)
        return
      }

      const ids = fams.map((f) => f.id)
      const [{ data: swimmers }, { data: invites }] = await Promise.all([
        supabase.from('swimmers').select('family_id, name').in('family_id', ids),
        supabase.from('family_invites').select('family_id, email, accepted_at, invite_role').in('family_id', ids),
      ])

      setFamilies(
        (fams as Family[]).map((f) => ({
          ...f,
          swimmers: (swimmers || []).filter((s) => s.family_id === f.id),
          invites: (invites || []).filter((i) => i.family_id === f.id),
        })),
      )
      setLoading(false)
    }
    load()
  }, [])

  return (
    <PortalLayout title="Admin">
      <AdminNav />
      <div className="flex items-center justify-between gap-4 mb-2">
        <PageTitle subtitle="Manage clients and send portal logins">Families</PageTitle>
        <Link
          to="/admin/families/new"
          className="shrink-0 rounded-full bg-gradient-to-r from-breeze-pink to-breeze-coral px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-breeze-pink/20 hover:opacity-95 transition-opacity -mt-4"
        >
          + Add family
        </Link>
      </div>

      {loading ? (
        <LoadingState />
      ) : families.length === 0 ? (
        <Card className="text-center portal-muted text-sm">
          No families yet. Add your first client to send them a portal login.
        </Card>
      ) : (
        <div className="space-y-3">
          {families.map((f) => {
            const status = inviteStatus(f)
            return (
              <Link key={f.id} to={`/admin/families/${f.id}`} className="block">
                <Card className="hover:border-breeze-sky/40 transition-colors text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-breeze-deep-dark">{f.primary_name}</p>
                      <p className="text-sm portal-muted">{f.primary_email}</p>
                      {f.swimmers[0] && (
                        <p className="text-sm text-breeze-muted mt-1">Swimmer: {f.swimmers.map((s) => s.name).join(', ')}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-xs font-bold ${status.tone}`}>{status.label}</span>
                      {f.notes_edit_pending && (
                        <p className="text-xs text-breeze-pink font-semibold mt-1">Notes updated</p>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </PortalLayout>
  )
}
