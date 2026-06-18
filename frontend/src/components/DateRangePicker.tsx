import { useState } from 'react'
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  start: Date
  end: Date
  onChange: (start: Date, end: Date) => void
}

const PRESETS: { label: string; minutes: number }[] = [
  { label: 'Last 15m', minutes: 15 },
  { label: 'Last 1h', minutes: 60 },
  { label: 'Last 24h', minutes: 60 * 24 },
  { label: 'Last 7d', minutes: 60 * 24 * 7 },
]

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function dayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function isBetween(d: Date, a: Date, b: Date): boolean {
  const t = dayMs(d)
  return t > Math.min(dayMs(a), dayMs(b)) && t < Math.max(dayMs(a), dayMs(b))
}

function formatTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function DateRangePicker({ start, end, onChange }: Props) {
  const [leftMonth, setLeftMonth] = useState(() => startOfMonth(start))
  const [pickingEnd, setPickingEnd] = useState(false)
  const rightMonth = addMonths(leftMonth, 1)

  function applyPreset(minutes: number) {
    const now = new Date()
    const s = new Date(now.getTime() - minutes * 60 * 1000)
    onChange(s, now)
    setLeftMonth(startOfMonth(s))
    setPickingEnd(false)
  }

  function handleDayClick(d: Date) {
    if (!pickingEnd) {
      const newStart = new Date(d)
      newStart.setHours(start.getHours(), start.getMinutes(), 0, 0)
      // If new start is after current end, also push end forward by same delta
      if (newStart > end) {
        const pushedEnd = new Date(newStart)
        pushedEnd.setHours(end.getHours(), end.getMinutes(), 0, 0)
        pushedEnd.setDate(pushedEnd.getDate() + 1)
        onChange(newStart, pushedEnd)
      } else {
        onChange(newStart, end)
      }
      setPickingEnd(true)
    } else {
      const newEnd = new Date(d)
      newEnd.setHours(end.getHours(), end.getMinutes(), 0, 0)
      if (newEnd < start) {
        // Clicked before start → swap: new start = clicked, end = old start
        const newStartFromClick = new Date(d)
        newStartFromClick.setHours(start.getHours(), start.getMinutes(), 0, 0)
        onChange(newStartFromClick, start)
      } else {
        onChange(start, newEnd)
      }
      setPickingEnd(false)
    }
  }

  function updateStart(d: Date) {
    onChange(d, end)
  }
  function updateEnd(d: Date) {
    onChange(start, d)
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3)',
      }}
    >
      <div className="flex">
        {/* Preset sidebar */}
        <div
          className="p-3 flex flex-col gap-1"
          style={{
            borderRight: '1px solid rgba(255, 255, 255, 0.06)',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            minWidth: 130,
          }}
        >
          <div className="flex items-center gap-1.5 px-1 py-1 mb-1">
            <Zap className="w-3 h-3 text-blue-400" />
            <span
              className="text-[10px] uppercase tracking-wider font-semibold"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Quick
            </span>
          </div>
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.minutes)}
              className="px-2.5 py-1.5 rounded-md text-xs text-left transition-all hover:bg-blue-500/10 hover:text-blue-300"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {p.label}
            </button>
          ))}

          <div className="mt-auto pt-3 border-t border-white/5">
            <div
              className="text-[9px] uppercase tracking-wider mb-1"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Next click
            </div>
            <div className="text-[11px] font-semibold text-blue-300">
              {pickingEnd ? 'Set END' : 'Set START'}
            </div>
          </div>
        </div>

        {/* Calendars + time sliders */}
        <div className="flex-1 p-4">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setLeftMonth(addMonths(leftMonth, -1))}
              className="p-1 rounded hover:bg-white/10 transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex gap-8 text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              <span className="flex-1 text-center" style={{ minWidth: 180 }}>
                {leftMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <span className="flex-1 text-center" style={{ minWidth: 180 }}>
                {rightMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
            </div>
            <button
              onClick={() => setLeftMonth(addMonths(leftMonth, 1))}
              className="p-1 rounded hover:bg-white/10 transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Dual calendar */}
          <div className="flex gap-6">
            <MonthGrid month={leftMonth} start={start} end={end} onPick={handleDayClick} />
            <MonthGrid month={rightMonth} start={start} end={end} onPick={handleDayClick} />
          </div>

          {/* Time sliders */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <TimeSlider label="Start" date={start} onChange={updateStart} active={!pickingEnd} />
            <TimeSlider label="End" date={end} onChange={updateEnd} active={pickingEnd} />
          </div>
        </div>
      </div>
    </div>
  )
}

function MonthGrid({
  month,
  start,
  end,
  onPick,
}: {
  month: Date
  start: Date
  end: Date
  onPick: (d: Date) => void
}) {
  const first = startOfMonth(month)
  const firstWeekday = first.getDay()
  const numDays = daysInMonth(month)
  const cells: (Date | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= numDays; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d))
  while (cells.length < 42) cells.push(null)
  const today = new Date()

  return (
    <div className="flex-1">
      <div
        className="grid grid-cols-7 gap-0.5 text-[10px] mb-1"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center py-1 font-semibold">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="aspect-square" />
          const isStart = sameDay(d, start)
          const isEnd = sameDay(d, end)
          const inRange = isBetween(d, start, end)
          const isToday = sameDay(d, today)
          const edge = isStart || isEnd
          return (
            <button
              key={i}
              onClick={() => onPick(d)}
              className={clsx(
                'aspect-square text-xs rounded-md transition-all flex items-center justify-center relative',
                !edge && !inRange && 'hover:bg-white/10',
              )}
              style={{
                backgroundColor: edge
                  ? '#3b82f6'
                  : inRange
                  ? 'rgba(59, 130, 246, 0.15)'
                  : 'transparent',
                color: edge
                  ? '#fff'
                  : inRange
                  ? '#bfdbfe'
                  : 'var(--color-text-primary)',
                fontWeight: edge ? 600 : 400,
                boxShadow: edge ? '0 0 12px rgba(59, 130, 246, 0.55)' : undefined,
                outline: isToday && !edge ? '1px solid rgba(96, 165, 250, 0.5)' : undefined,
              }}
              title={formatDateShort(d)}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TimeSlider({
  label,
  date,
  onChange,
  active,
}: {
  label: string
  date: Date
  onChange: (d: Date) => void
  active: boolean
}) {
  function setHour(h: number) {
    const d = new Date(date)
    d.setHours(h, d.getMinutes(), 0, 0)
    onChange(d)
  }
  function setMinute(m: number) {
    const d = new Date(date)
    d.setHours(d.getHours(), m, 0, 0)
    onChange(d)
  }

  return (
    <div
      className="p-3 rounded-lg transition-all"
      style={{
        backgroundColor: active ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.03)',
        border: active ? '1px solid rgba(59, 130, 246, 0.35)' : '1px solid rgba(255, 255, 255, 0.06)',
      }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <div
            className="text-[10px] uppercase tracking-wider font-semibold"
            style={{ color: active ? '#93c5fd' : 'var(--color-text-muted)' }}
          >
            {label}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            {formatDateShort(date)}
          </div>
        </div>
        <span
          className="text-xl font-mono font-semibold tabular-nums text-blue-300"
          style={{ textShadow: '0 0 8px rgba(59, 130, 246, 0.4)' }}
        >
          {formatTime(date)}
        </span>
      </div>

      <div className="space-y-2">
        <SliderRow
          label="H"
          value={date.getHours()}
          max={23}
          onChange={setHour}
        />
        <SliderRow
          label="M"
          value={date.getMinutes()}
          max={59}
          onChange={setMinute}
        />
      </div>
    </div>
  )
}

function SliderRow({
  label,
  value,
  max,
  onChange,
}: {
  label: string
  value: number
  max: number
  onChange: (n: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[10px] w-3 text-center font-semibold"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {label}
      </span>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="chronos-slider flex-1"
      />
      <span
        className="text-[11px] tabular-nums w-6 text-right font-mono"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {String(value).padStart(2, '0')}
      </span>
    </div>
  )
}
