import type { Enrollment } from './types'

export const LESSON_MINUTES = 15
export const DEFAULT_TRAVEL_BREAK_MINUTES = 30

export function formatLessonTime(t: string | null) {
  if (!t) return 'Time TBD'
  const [h, m] = t.split(':')
  const hour = parseInt(h, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 || 12
  return `${h12}:${m} ${ampm}`
}

export function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function minutesToTimeLabel(minutes: number) {
  const h24 = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  const ampm = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 || 12
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
}

export function formatTimeRange(startMin: number, endMin: number) {
  return `${minutesToTimeLabel(startMin)} – ${minutesToTimeLabel(endMin)}`
}

export function isLessonDay(date = new Date()) {
  const day = date.getDay()
  return day >= 1 && day <= 4
}

export function lessonDayName(date = new Date()) {
  return date.toLocaleDateString(undefined, { weekday: 'long' })
}

export function isEnrollmentActiveToday(
  enrollment: Pick<Enrollment, 'start_date' | 'end_date'>,
  date = new Date(),
) {
  const today = date.toISOString().slice(0, 10)
  if (enrollment.start_date && today < enrollment.start_date) return false
  if (enrollment.end_date && today > enrollment.end_date) return false
  return true
}

export type DayLesson = {
  id: string
  time: string
  startMin: number
  swimmerName: string
  familyName: string
  familyId: string
  poolKey: string
  poolLabel: string
  poolAddress: string | null
  location: Enrollment['location']
}

export type PoolBlock = {
  type: 'pool'
  poolKey: string
  poolLabel: string
  poolAddress: string | null
  lessons: DayLesson[]
  startMin: number
  endMin: number
}

export type BreakBlock = {
  type: 'break'
  startMin: number
  endMin: number
  minutes: number
}

export type ScheduleBlock = PoolBlock | BreakBlock

export function poolKeyFor(location: Enrollment['location'], poolAddress: string | null) {
  if (location === 'client_pool' && poolAddress?.trim()) {
    return `client:${poolAddress.trim().toLowerCase()}`
  }
  return 'bunnell'
}

export function poolLabelFor(location: Enrollment['location'], poolAddress: string | null) {
  if (location === 'client_pool') {
    return poolAddress?.trim() || 'Client private pool'
  }
  return 'Bunnell pool'
}

export function generateLessonTimeOptions(startHour = 8, endHour = 20, stepMinutes = 15) {
  const options: { value: string; label: string }[] = []
  for (let min = startHour * 60; min <= endHour * 60; min += stepMinutes) {
    const h = Math.floor(min / 60)
    const m = min % 60
    const value = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
    options.push({ value, label: formatLessonTime(value) })
  }
  return options
}

export const LESSON_TIME_OPTIONS = generateLessonTimeOptions()

export function buildDaySchedule(lessons: DayLesson[]): ScheduleBlock[] {
  if (!lessons.length) return []

  const sorted = [...lessons].sort((a, b) => a.startMin - b.startMin)
  const blocks: ScheduleBlock[] = []

  let currentPoolKey = sorted[0].poolKey
  let currentLessons: DayLesson[] = [sorted[0]]

  function flushPool() {
    if (!currentLessons.length) return
    const startMin = currentLessons[0].startMin
    const last = currentLessons[currentLessons.length - 1]
    const endMin = last.startMin + LESSON_MINUTES
    blocks.push({
      type: 'pool',
      poolKey: currentPoolKey,
      poolLabel: currentLessons[0].poolLabel,
      poolAddress: currentLessons[0].poolAddress,
      lessons: currentLessons,
      startMin,
      endMin,
    })
  }

  for (let i = 1; i < sorted.length; i++) {
    const lesson = sorted[i]
    const prev = sorted[i - 1]
    const prevEnd = prev.startMin + LESSON_MINUTES

    if (lesson.poolKey !== currentPoolKey) {
      flushPool()
      const gap = lesson.startMin - prevEnd
      if (gap >= 5) {
        blocks.push({
          type: 'break',
          startMin: prevEnd,
          endMin: lesson.startMin,
          minutes: gap,
        })
      } else {
        blocks.push({
          type: 'break',
          startMin: prevEnd,
          endMin: prevEnd + DEFAULT_TRAVEL_BREAK_MINUTES,
          minutes: DEFAULT_TRAVEL_BREAK_MINUTES,
        })
      }

      currentPoolKey = lesson.poolKey
      currentLessons = [lesson]
      continue
    }

    if (lesson.startMin - prevEnd >= 20) {
      flushPool()
      blocks.push({
        type: 'break',
        startMin: prevEnd,
        endMin: lesson.startMin,
        minutes: lesson.startMin - prevEnd,
      })
      currentPoolKey = lesson.poolKey
      currentLessons = [lesson]
      continue
    }

    currentLessons.push(lesson)
  }

  flushPool()
  return blocks
}
