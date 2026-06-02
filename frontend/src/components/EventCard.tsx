import { Wand2, Loader2, ChevronDown, ChevronRight, Zap } from 'lucide-react'
import { SecurityEvent } from '../types'
import { fmtTime, fmtDate } from '../utils/dateFormat'
import { EventGroup, getSourceIp, isFreshEvent } from '../utils/eventGroup'
import SeverityBadge from './SeverityBadge'
import StatusBadge from './StatusBadge'

interface EventCardProps {
  event: SecurityEvent
  group?: EventGroup
  expanded?: boolean
  onToggleExpand?: (e: React.MouseEvent) => void
  onClick?: () => void
  onDelete?: (e: React.MouseEvent) => void
  onExplain?: (e: React.MouseEvent) => void
  explaining?: boolean
}

export default function EventCard({
  event,
  group,
  expanded,
  onToggleExpand,
  onClick,
  onDelete,
  onExplain,
  explaining,
}: EventCardProps) {
  const grouped = !!group && group.count > 1
  const sourceIp = getSourceIp(event)
  const fresh = isFreshEvent(event)
  const ipsToShow = group ? group.uniqueIps : sourceIp ? [sourceIp] : []
  const isBurst = !!group?.isBurst

  return (
    <div
      onClick={onClick}
      className={`bg-gray-800 border ${
        isBurst ? 'border-amber-500/40' : 'border-gray-700'
      } rounded-lg p-4 hover:border-gray-600 cursor-pointer transition-colors`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {fresh && (
              <span
                title="Less than 5 minutes old"
                className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"
              />
            )}
            <SeverityBadge severity={event.severity} size="sm" />
            <StatusBadge status={event.status} />
            <span className="text-gray-400 text-sm">{event.source}</span>
            {grouped && (
              <button
                onClick={onToggleExpand}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
                title={expanded ? 'Collapse group' : 'Expand to see individual events'}
              >
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                {group.count}×
              </button>
            )}
            {isBurst && (
              <span
                title={`${group!.count} events in ${group!.timeSpanSec.toFixed(1)}s`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300"
              >
                <Zap className="w-3 h-3" /> Burst
              </span>
            )}
          </div>
          <h3 className="font-medium text-white truncate">{event.event_type}</h3>
          <p className="text-gray-400 text-sm mt-1 line-clamp-2">{event.description}</p>
          {ipsToShow.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {ipsToShow.slice(0, 4).map((ip) => (
                <span
                  key={ip}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono bg-slate-900/60 border border-slate-700 text-slate-300"
                  title="Source IP"
                >
                  {ip}
                </span>
              ))}
              {ipsToShow.length > 4 && (
                <span className="text-[11px] text-slate-400">
                  +{ipsToShow.length - 4} more
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-start gap-3">
          <div className="text-right text-sm text-gray-400">
            <div>{fmtTime(event.timestamp)}</div>
            <div>{fmtDate(event.timestamp)}</div>
            {grouped && group!.timeSpanSec > 0 && (
              <div className="text-[11px] text-slate-500 mt-0.5">
                span {formatSpan(group!.timeSpanSec)}
              </div>
            )}
            {event.site_id && (
              <div className="mt-1 text-xs text-blue-400">{event.site_id}</div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {onExplain && event.raw_log && (
              <button
                onClick={onExplain}
                disabled={explaining}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 hover:text-violet-200 transition-colors disabled:opacity-60"
                title="Explain this log with AI"
              >
                {explaining
                  ? <><Loader2 className="w-3 h-3 animate-spin" /><span>Explaining…</span></>
                  : <><Wand2 className="w-3 h-3" /><span>Explain</span></>}
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100"
                title="Delete event"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function formatSpan(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}
