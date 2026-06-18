import { useState, useMemo } from 'react'
import { HeatmapEntry } from '../types'
import { useLanguage } from '../context/LanguageContext'
import clsx from 'clsx'

interface Props {
  data: HeatmapEntry[]
  loading?: boolean
  days?: number
  onTimeRangeChange?: (days: number) => void
  onTimeSliceSelect?: (start: string, end: string) => void
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)

function getCellColor(count: number, max: number): string {
  if (count === 0 || max === 0) return 'bg-slate-800/40 border border-slate-700/50'
  const ratio = count / max
  if (ratio < 0.15) return 'bg-blue-900/80 border border-blue-800/50'
  if (ratio < 0.35) return 'bg-blue-700/80 border border-blue-600/50'
  if (ratio < 0.6)  return 'bg-blue-500/90 border border-blue-400/50'
  if (ratio < 0.8)  return 'bg-orange-500/90 border border-orange-400/50'
  return 'bg-red-500/90 border border-red-400/50'
}

export default function ActivityHeatmap({ data, loading, days = 30, onTimeRangeChange, onTimeSliceSelect }: Props) {
  const { t, locale } = useLanguage()
  const [hoveredCell, setHoveredCell] = useState<{ date: string; hour: number } | null>(null)
  const [selectedCell, setSelectedCell] = useState<{ date: string; hour: number } | null>(null)

  if (loading) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 flex flex-col gap-4">
        <h2 className="text-lg font-bold text-slate-100 mb-2">{t('heatmap.title')}</h2>
        <div className="animate-pulse bg-slate-800/50 rounded-xl h-64 w-full"></div>
      </div>
    )
  }

  // Generate date list for the last N days
  const dateList = useMemo(() => {
    const list = []
    const now = new Date()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const dateString = d.toISOString().split('T')[0]
      const label = new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric' }).format(d)
      list.push({ date: dateString, label })
    }
    return list
  }, [days, locale])

  // Build lookup map and find max
  const grid = useMemo(() => {
    const map = new Map<string, HeatmapEntry>()
    let max = 0
    data.forEach((entry) => {
      const key = `${entry.date}-${entry.hour}`
      map.set(key, entry)
      if (entry.count > max) max = entry.count
    })
    return { map, max }
  }, [data])

  const handleCellClick = (date: string, hour: number) => {
    if (selectedCell?.date === date && selectedCell?.hour === hour) {
      setSelectedCell(null)
      onTimeSliceSelect?.('', '')
      return
    }

    setSelectedCell({ date, hour })

    const startDate = new Date(`${date}T${hour.toString().padStart(2, '0')}:00:00Z`)
    const endDate = new Date(startDate)
    endDate.setHours(startDate.getHours() + 1)
    endDate.setSeconds(endDate.getSeconds() - 1)

    onTimeSliceSelect?.(startDate.toISOString(), endDate.toISOString())
  }

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800/80 p-5 shadow-2xl backdrop-blur-md lg:col-span-2">
      {/* Header and Legend */}
      <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            {t('heatmap.title')} ({days} {t('heatmap.days')})
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            {t('heatmap.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Time Range Selector */}
          <div className="flex items-center bg-slate-800/80 rounded-lg p-1 border border-slate-700">
            <button
              onClick={() => onTimeRangeChange?.(7)}
              className={clsx(
                "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                days === 7 ? "bg-slate-600 text-white" : "text-slate-400 hover:text-slate-200"
              )}
            >
              {t('heatmap.last7days')}
            </button>
            <button
              onClick={() => onTimeRangeChange?.(30)}
              className={clsx(
                "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                days === 30 ? "bg-slate-600 text-white" : "text-slate-400 hover:text-slate-200"
              )}
            >
              {t('heatmap.last30days')}
            </button>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700/50">
            <span>{t('heatmap.low')}</span>
            {['bg-slate-800/40 border border-slate-700/50', 'bg-blue-900/80 border border-blue-800/50', 'bg-blue-700/80 border border-blue-600/50', 'bg-blue-500/90 border border-blue-400/50', 'bg-orange-500/90 border border-orange-400/50', 'bg-red-500/90 border border-red-400/50'].map((c) => (
              <div key={c} className={`w-3 h-3 rounded-[1px] ${c}`} />
            ))}
            <span>{t('heatmap.high')}</span>
          </div>
        </div>
      </div>

      <div className="relative">
        {/* Vertical crosshair guide line */}
        {hoveredCell && (
          <div
            className="absolute top-0 bottom-6 w-px bg-white/20 z-0 pointer-events-none transition-all duration-150 shadow-[0_0_8px_rgba(255,255,255,0.5)]"
            style={{
              left: `calc(56px + ((100% - 56px) / 24) * ${hoveredCell.hour} + (((100% - 56px) / 24) / 2))`
            }}
          />
        )}

        {/* Top Hours header */}
        <div className="flex items-center mb-1">
          <div className="w-14 shrink-0" />
          <div className="flex flex-1">
            {HOURS.map((h) => (
              <div key={h} className="flex-1 min-w-0 w-0 text-center text-slate-500 font-medium" style={{ fontSize: 10 }}>
                {h % 4 === 0 ? `${h}h` : ''}
              </div>
            ))}
          </div>
        </div>

        {/* Grid rows */}
        {dateList.map(({ date, label }) => (
          <div key={date} className="flex items-center" style={{ height: days > 14 ? '20px' : '24px' }}>
            <div className="w-14 shrink-0 text-right pr-2 text-slate-500 text-[10px] uppercase font-medium tracking-wider">
              {label}
            </div>
            <div className="flex flex-1 gap-[2px] h-full py-[1px]">
              {HOURS.map((h) => {
                const key = `${date}-${h}`
                const entry = grid.map.get(key)
                const count = entry?.count || 0
                const isHovered = hoveredCell?.date === date && hoveredCell?.hour === h
                const isColumnHovered = hoveredCell?.hour === h
                const isSelected = selectedCell?.date === date && selectedCell?.hour === h

                return (
                  <div
                    key={h}
                    className={clsx(
                      "flex-1 min-w-0 w-0 rounded-[1px] cursor-pointer relative group transition-all duration-150",
                      getCellColor(count, grid.max),
                      isHovered && "ring-2 ring-white/50 z-10 scale-110",
                      isSelected && "ring-[3px] ring-white z-10 animate-pulse",
                      isColumnHovered && !isHovered && "brightness-125",
                      !isColumnHovered && hoveredCell && "opacity-40"
                    )}
                    onMouseEnter={() => setHoveredCell({ date, hour: h })}
                    onMouseLeave={() => setHoveredCell(null)}
                    onClick={() => handleCellClick(date, h)}
                  >
                    {/* Tooltip via group-hover */}
                    <div className="absolute opacity-0 group-hover:opacity-100 invisible group-hover:visible z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-slate-800 text-xs text-slate-200 rounded shadow-lg border border-slate-700 whitespace-nowrap pointer-events-none transition-opacity">
                      <div className="font-semibold text-white mb-1">{label} {h}:00 - {h+1}:00</div>
                      {count > 0 ? (
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                          <div className="text-slate-400">{t('heatmap.total')}:</div>
                          <div className="font-medium">{count}</div>
                          <div className="text-red-400">{t('heatmap.critical')}:</div>
                          <div className="font-medium text-red-400">{entry?.critical || 0}</div>
                          <div className="text-orange-400">{t('heatmap.high')}:</div>
                          <div className="font-medium text-orange-400">{entry?.high || 0}</div>
                          <div className="text-blue-400">{t('heatmap.medLow')}:</div>
                          <div className="font-medium text-blue-400">{(entry?.medium || 0) + (entry?.low || 0)}</div>
                        </div>
                      ) : (
                        <div className="text-slate-400">{t('heatmap.noEvents')}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Bottom Hours header */}
        <div className="flex items-center mt-1">
          <div className="w-14 shrink-0" />
          <div className="flex flex-1">
            {HOURS.map((h) => (
              <div key={h} className="flex-1 min-w-0 w-0 text-center text-slate-500 font-medium" style={{ fontSize: 10 }}>
                {h % 4 === 0 ? `${h}h` : ''}
              </div>
            ))}
          </div>
        </div>
      </div>

      {selectedCell && (
        <div className="mt-4 flex items-center justify-between text-xs bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-4 py-2 rounded-lg animate-in fade-in slide-in-from-top-2">
          <span>
            {t('heatmap.filteringFor')} <strong className="text-white">{selectedCell.date} at {selectedCell.hour}:00</strong>
          </span>
          <button
            onClick={() => {
              setSelectedCell(null)
              onTimeSliceSelect?.('', '')
            }}
            className="hover:text-white transition-colors underline decoration-indigo-500/50 underline-offset-2"
          >
            {t('heatmap.clearFilter')}
          </button>
        </div>
      )}
    </div>
  )
}
