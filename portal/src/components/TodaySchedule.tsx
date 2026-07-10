import { Link } from 'react-router-dom'
import { Card, SectionTitle } from './ui'
import {
  buildDaySchedule,
  DEFAULT_TRAVEL_BREAK_MINUTES,
  formatLessonTime,
  formatTimeRange,
  isLessonDay,
  lessonDayName,
  type DayLesson,
  type ScheduleBlock,
} from '../lib/schedule'

function PoolBlockCard({ block }: { block: Extract<ScheduleBlock, { type: 'pool' }> }) {
  return (
    <div className="rounded-2xl border-2 border-breeze-sky/35 bg-white/95 overflow-hidden">
      <div className="bg-gradient-to-r from-breeze-deep to-breeze-sky px-4 py-3 text-white">
        <p className="font-display text-lg leading-tight">{block.poolLabel}</p>
        <p className="text-sm text-white/90 mt-0.5">{formatTimeRange(block.startMin, block.endMin)}</p>
        {block.poolAddress && block.poolLabel !== block.poolAddress && (
          <p className="text-xs text-white/80 mt-1">{block.poolAddress}</p>
        )}
      </div>
      <ul className="divide-y divide-breeze-sky/10">
        {block.lessons.map((lesson) => (
          <li key={lesson.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <p className="font-semibold text-breeze-deep-dark">{lesson.swimmerName}</p>
              <p className="text-breeze-muted text-xs">{lesson.familyName}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-breeze-deep">{formatLessonTime(lesson.time)}</p>
              <Link
                to={`/admin/families/${lesson.familyId}`}
                className="text-xs text-breeze-pink font-semibold hover:text-breeze-coral"
              >
                Profile →
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function BreakBlockCard({ block }: { block: Extract<ScheduleBlock, { type: 'break' }> }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-breeze-gold/60 bg-breeze-gold/25 px-4 py-4 text-center">
      <p className="font-display text-lg text-breeze-deep-dark">Break</p>
      <p className="text-sm font-semibold text-breeze-muted mt-1">
        {formatTimeRange(block.startMin, block.endMin)}
      </p>
      <p className="text-xs text-breeze-muted/80 mt-1">
        {block.minutes >= DEFAULT_TRAVEL_BREAK_MINUTES - 5
          ? 'Travel & reset between pools'
          : 'Buffer between lessons'}
      </p>
    </div>
  )
}

export function TodaySchedule({
  lessons,
  loading,
}: {
  lessons: DayLesson[]
  loading: boolean
}) {
  const today = new Date()
  const lessonDay = isLessonDay(today)
  const blocks = lessonDay ? buildDaySchedule(lessons) : []

  return (
    <Card className="text-left mb-6">
      <SectionTitle className="mb-1">Today&apos;s schedule</SectionTitle>
      <p className="text-sm text-breeze-muted mb-5">
        {today.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })}
        {lessonDay ? ' · Mon–Thu lesson day' : ` · ${lessonDayName(today)} — no regular lessons`}
      </p>

      {loading ? (
        <p className="text-sm portal-muted">Loading schedule…</p>
      ) : !lessonDay ? (
        <p className="text-sm portal-muted leading-relaxed">
          Breeze Swim lessons run Monday through Thursday. Enjoy your day off — or use Families to
          plan ahead.
        </p>
      ) : lessons.length === 0 ? (
        <p className="text-sm portal-muted leading-relaxed">
          No lessons on the calendar yet. Add families and set lesson times in{' '}
          <Link to="/admin/families" className="text-breeze-deep font-semibold">
            Families
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-4">
          {blocks.map((block, i) =>
            block.type === 'pool' ? (
              <PoolBlockCard key={`pool-${block.poolKey}-${i}`} block={block} />
            ) : (
              <BreakBlockCard key={`break-${block.startMin}-${i}`} block={block} />
            ),
          )}
          <p className="text-xs text-breeze-muted/80 text-center pt-1">
            {blocks.filter((b) => b.type === 'pool').length} pool
            {blocks.filter((b) => b.type === 'pool').length === 1 ? '' : 's'} today · 15 min lesson
          </p>
        </div>
      )}
    </Card>
  )
}
