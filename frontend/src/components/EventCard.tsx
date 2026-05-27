import { SecurityEvent } from '../types'
import { fmtTime, fmtDate } from '../utils/dateFormat'
import SeverityBadge from './SeverityBadge'
import StatusBadge from './StatusBadge'

interface EventCardProps {
  event: SecurityEvent
  onClick?: () => void
  onDelete?: (e: React.MouseEvent) => void
}

export default function EventCard({ event, onClick, onDelete }: EventCardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-gray-600 cursor-pointer transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <SeverityBadge severity={event.severity} size="sm" />
            <StatusBadge status={event.status} />
            <span className="text-gray-400 text-sm">{event.source}</span>
          </div>
          <h3 className="font-medium text-white truncate">{event.event_type}</h3>
          <p className="text-gray-400 text-sm mt-1 line-clamp-2">{event.description}</p>
        </div>
        <div className="flex items-start gap-3">
          <div className="text-right text-sm text-gray-400">
            <div>{fmtTime(event.timestamp)}</div>
            <div>{fmtDate(event.timestamp)}</div>
            {event.site_id && (
              <div className="mt-1 text-xs text-blue-400">{event.site_id}</div>
            )}
          </div>
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
              title="Delete event"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
