import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminNav } from '../../components/AdminNav'
import { TodaySchedule } from '../../components/TodaySchedule'
import { Card, PageTitle, PortalLayout, StatCard } from '../../components/ui'
import {
  isEnrollmentActiveToday,
  poolKeyFor,
  poolLabelFor,
  timeToMinutes,
  type DayLesson,
} from '../../lib/schedule'
import { supabase } from '../../lib/supabase'
import type { AdminNotification, Family, Payment } from '../../lib/types'
import { formatCents } from '../../lib/types'

type DueRow = Payment & { families: Pick<Family, 'primary_name' | 'primary_email'> }

type SwimmerRow = {
  id: string
  name: string
  status: string
  families: Pick<Family, 'id' | 'primary_name' | 'pool_address'> | null
  enrollments: {
    id: string
    lesson_time: string | null
    location: 'bunnell' | 'client_pool'
    start_date: string | null
    end_date: string | null
  }[]
}

export function AdminDashboardPage() {
  const [duePayments, setDuePayments] = useState<DueRow[]>([])
  const [outstandingCents, setOutstandingCents] = useState(0)
  const [dayLessons, setDayLessons] = useState<DayLesson[]>([])
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: due }, { data: allDuePayments }, { data: dueRegs }, { data: swimmers }, { data: notes }] =
        await Promise.all([
        supabase
          .from('payments')
          .select('*, families(primary_name, primary_email)')
          .eq('status', 'due')
          .order('due_date', { ascending: true })
          .limit(8),
        supabase.from('payments').select('amount_cents').eq('status', 'due'),
        supabase.from('registration_fees').select('amount_cents').eq('status', 'due'),
        supabase
          .from('swimmers')
          .select(
            'id, name, status, family_id, families(id, primary_name, pool_address), enrollments(id, lesson_time, location, start_date, end_date)',
          )
          .eq('status', 'active'),
        supabase
          .from('admin_notifications')
          .select('*')
          .is('read_at', null)
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      const lessons: DayLesson[] = []
      for (const row of (swimmers as unknown as SwimmerRow[]) || []) {
        const family = Array.isArray(row.families) ? row.families[0] : row.families
        if (!family) continue
        for (const enr of row.enrollments || []) {
          if (!enr.lesson_time || !isEnrollmentActiveToday(enr)) continue
          lessons.push({
            id: enr.id,
            time: enr.lesson_time,
            startMin: timeToMinutes(enr.lesson_time.slice(0, 5)),
            swimmerName: row.name,
            familyName: family.primary_name,
            familyId: family.id,
            location: enr.location,
            poolAddress: family.pool_address,
            poolKey: poolKeyFor(enr.location, family.pool_address),
            poolLabel: poolLabelFor(enr.location, family.pool_address),
          })
        }
      }

      setDayLessons(lessons)
      setDuePayments((due as DueRow[]) || [])
      const weeklyDue = ((allDuePayments as { amount_cents: number }[]) || []).reduce(
        (sum, p) => sum + p.amount_cents,
        0,
      )
      const regDue = ((dueRegs as { amount_cents: number }[]) || []).reduce(
        (sum, r) => sum + r.amount_cents,
        0,
      )
      setOutstandingCents(weeklyDue + regDue)
      setNotifications((notes as AdminNotification[]) || [])
      setLoading(false)
    }
    load()
  }, [])

  async function dismissNotification(id: string) {
    await supabase.rpc('mark_notification_read', { p_notification_id: id })
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const poolCount = new Set(dayLessons.map((l) => l.poolKey)).size

  return (
    <PortalLayout title="Admin">
      <AdminNav />
      <PageTitle subtitle="Your pools, breaks, and lessons for today">Today</PageTitle>

      <TodaySchedule lessons={dayLessons} loading={loading} />

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Pools today"
          value={poolCount}
          accent="var(--color-breeze-sky)"
        />
        <StatCard label="Lessons today" value={dayLessons.length} accent="var(--color-breeze-pink)" />
        <StatCard
          label="Outstanding"
          value={formatCents(outstandingCents)}
          accent="var(--color-breeze-gold)"
        />
      </div>

      {notifications.length > 0 && (
        <Card className="text-left mb-6 space-y-3">
          <h2 className="font-display text-lg text-breeze-deep-dark">Needs attention</h2>
          {notifications.map((n) => (
            <div
              key={n.id}
              className="flex items-start justify-between gap-3 border-b portal-divider pb-3 last:border-0 last:pb-0"
            >
              <div>
                <p className="text-sm text-breeze-muted">{n.message}</p>
                <Link
                  to={`/admin/families/${n.family_id}`}
                  className="text-xs text-breeze-deep font-semibold mt-1 inline-block"
                >
                  View family →
                </Link>
              </div>
              <button
                type="button"
                onClick={() => dismissNotification(n.id)}
                className="text-xs text-breeze-muted/70 hover:text-breeze-pink shrink-0"
              >
                Dismiss
              </button>
            </div>
          ))}
        </Card>
      )}

      <Card className="text-left">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-display text-lg text-breeze-deep-dark">Open balances</h2>
          <Link to="/admin/payments" className="text-sm text-breeze-deep font-semibold">
            Finances →
          </Link>
        </div>
        {loading ? (
          <p className="text-sm portal-muted">Loading…</p>
        ) : duePayments.length === 0 ? (
          <p className="text-sm portal-muted">
            No open payments.{' '}
            <Link to="/admin/payments" className="text-breeze-deep font-semibold">
              Generate this week&apos;s ledger
            </Link>
          </p>
        ) : (
          <ul className="space-y-2">
            {duePayments.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 text-sm border-b portal-divider pb-2">
                <span>
                  <strong>{p.families?.primary_name}</strong>
                  <span className="portal-muted"> · week of {p.due_date}</span>
                </span>
                <span className="font-semibold text-breeze-deep">{formatCents(p.amount_cents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PortalLayout>
  )
}
