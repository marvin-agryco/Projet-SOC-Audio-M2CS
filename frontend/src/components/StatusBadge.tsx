import clsx from 'clsx'
import { EventStatus, IncidentStatus } from '../types'

type AnyStatus = EventStatus | IncidentStatus

interface StatusBadgeProps {
  status: AnyStatus
}

const statusStyles: Record<AnyStatus, string> = {
  new: 'bg-purple-600 text-white',
  open: 'bg-blue-600 text-white',
  investigating: 'bg-yellow-600 text-white',
  resolved: 'bg-green-600 text-white',
  false_positive: 'bg-gray-600 text-white',
}

const statusLabels: Record<AnyStatus, string> = {
  new: 'New',
  open: 'Open',
  investigating: 'Investigating',
  resolved: 'Resolved',
  false_positive: 'False Positive',
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        statusStyles[status] ?? 'bg-gray-600 text-white'
      )}
    >
      {statusLabels[status] ?? status}
    </span>
  )
}
