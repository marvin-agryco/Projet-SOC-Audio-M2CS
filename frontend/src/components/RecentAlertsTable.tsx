import { useState, useEffect, useRef, useMemo } from 'react'
import { ChevronDown, User, Eye, UserCheck, Ban } from 'lucide-react'
import clsx from 'clsx'
import { Severity, Analyst } from '../types'
import { fetchAnalysts, updateEventStatus } from '../api'
import { useRole } from '../context/RoleContext'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { toast } from './Toast'

interface AlertRow {
    id: string
    severity: Severity
    alertName: string
    source: string
    sourceKey?: string
    time: string
    assignee?: string
    count?: number
}

interface RecentAlertsTableProps {
    alerts: AlertRow[]
    isLive?: boolean
    onAlertClick?: (alertId: string) => void
    onAssigneeClick?: (alertId: string, currentAssignee?: string) => void
    filteredSource?: string | null
    filterLabel?: string
}

const severityStyles: Record<Severity, string> = {
    critical: 'badge-critical',
    high: 'badge-high',
    medium: 'badge-medium',
    low: 'badge-low',
}

export default function RecentAlertsTable({
    alerts,
    isLive = true,
    onAlertClick,
    onAssigneeClick: _onAssigneeClick,
    filteredSource,
    filterLabel,
}: RecentAlertsTableProps) {
    void _onAssigneeClick
    const { canAssign } = useRole()
    const { user } = useAuth()
    const { t } = useLanguage()
    const [assignDropdownId, setAssignDropdownId] = useState<string | null>(null)
    const [quickAssignOptions, setQuickAssignOptions] = useState<Analyst[]>([])
    const [assigneeOverrides, setAssigneeOverrides] = useState<Record<string, string>>({})

    // Track previous alert IDs for new-entry animation
    const prevIdsRef = useRef<Set<string>>(new Set())
    const [newIds, setNewIds] = useState<Set<string>>(new Set())

    useEffect(() => {
        const currentIds = new Set(alerts.map((a) => a.id))
        const freshIds = new Set<string>()
        for (const id of currentIds) {
            if (!prevIdsRef.current.has(id) && prevIdsRef.current.size > 0) {
                freshIds.add(id)
            }
        }
        if (freshIds.size > 0) {
            setNewIds(freshIds)
            const timer = setTimeout(() => setNewIds(new Set()), 2000)
            return () => clearTimeout(timer)
        }
        prevIdsRef.current = currentIds
    }, [alerts])

    useEffect(() => {
        fetchAnalysts()
            .then((data) => setQuickAssignOptions(data.analysts || []))
            .catch(() => setQuickAssignOptions([]))
    }, [])

    // Filter alerts if source filter is active
    const displayedAlerts = useMemo(
        () => filteredSource
            ? alerts.filter((a) => a.sourceKey === filteredSource || a.source === filterLabel)
            : alerts,
        [alerts, filteredSource, filterLabel]
    )

    const handleRowClick = (alertId: string, e: React.MouseEvent) => {
        // Don't trigger row click if clicking on assignee dropdown
        if ((e.target as HTMLElement).closest('.assignee-dropdown') || (e.target as HTMLElement).closest('.actions-column')) {
            return
        }
        onAlertClick?.(alertId)
    }

    const handleAssigneeClick = (e: React.MouseEvent, alertId: string) => {
        e.stopPropagation()
        setAssignDropdownId(assignDropdownId === alertId ? null : alertId)
    }

    const handleAssign = async (alertId: string, analystName: string) => {
        setAssignDropdownId(null)
        try {
            await updateEventStatus(alertId, { assigned_to: analystName || undefined })
            setAssigneeOverrides((prev) => ({ ...prev, [alertId]: analystName }))
        } catch {
            // silently ignore — row will revert to original assignee on next data refresh
        }
    }

    const handleFalsePositive = async (alertId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        try {
            await updateEventStatus(alertId, { status: 'false_positive' })
            toast.success(t('alerts.markedFP'))
        } catch {
            toast.error(t('alerts.failedFP'))
        }
    }

    return (
        <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-slate-100">
                        {t('alerts.recentTitle')}
                    </h3>
                    {filteredSource && filterLabel && (
                        <span className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded-full">
                            {t('alerts.filtered')}: {filterLabel}
                        </span>
                    )}
                </div>
                {isLive && (
                    <span className="flex items-center gap-2 text-xs">
                        <span className="live-pulse w-2 h-2 bg-green-500 rounded-full" />
                        <span className="text-slate-400">{t('alerts.liveFeed')}</span>
                        <span className="text-slate-500">{t('alerts.feed')}</span>
                    </span>
                )}
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-700">
                            <th className="pb-3 pr-4">{t('alerts.severity')}</th>
                            <th className="pb-3 pr-4">{t('alerts.alertName')}</th>
                            <th className="pb-3 pr-4">{t('alerts.source')}</th>
                            <th className="pb-3 pr-4">{t('alerts.time')}</th>
                            <th className="pb-3 pr-4">{t('alerts.assignee')}</th>
                            <th className="pb-3">{t('alerts.actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                        {displayedAlerts.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-8 text-center text-slate-500">
                                    {filteredSource
                                        ? `${t('alerts.noAlertsFrom')} ${filterLabel}`
                                        : t('alerts.noRecent')}
                                </td>
                            </tr>
                        ) : (
                            displayedAlerts.map((alert, index) => (
                                <tr
                                    key={alert.id}
                                    onClick={(e) => handleRowClick(alert.id, e)}
                                    className={clsx(
                                        'hover:bg-slate-700/30 transition-all cursor-pointer group',
                                        'animate-fade-in',
                                        newIds.has(alert.id) && 'animate-new-entry'
                                    )}
                                    style={{ animationDelay: `${index * 50}ms` }}
                                >
                                    <td className="py-3 pr-4">
                                        <span
                                            className={clsx(
                                                'px-2 py-1 text-xs font-medium rounded capitalize',
                                                severityStyles[alert.severity]
                                            )}
                                        >
                                            {alert.severity}
                                        </span>
                                    </td>
                                    <td className="py-3 pr-4">
                                        <span className="text-blue-400 group-hover:text-blue-300 font-medium transition-colors">
                                            {alert.alertName}
                                        </span>
                                        {alert.count && alert.count > 1 && (
                                            <span className="ml-2 px-1.5 py-0.5 text-xs bg-slate-600 text-slate-300 rounded-full">
                                                {alert.count}x
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-3 pr-4 text-slate-400">{alert.source}</td>
                                    <td className="py-3 pr-4 text-slate-400 font-mono text-sm">
                                        {alert.time}
                                    </td>
                                    <td className="py-3 relative assignee-dropdown">
                                        {canAssign ? (
                                            <>
                                                <button
                                                    onClick={(e) => handleAssigneeClick(e, alert.id)}
                                                    className={clsx(
                                                        'flex items-center gap-2 px-2 py-1 rounded transition-colors',
                                                        (assigneeOverrides[alert.id] ?? alert.assignee)
                                                            ? 'text-slate-300 hover:bg-slate-700'
                                                            : 'text-slate-600 hover:text-slate-400 hover:bg-slate-700'
                                                    )}
                                                >
                                                    <User className="w-4 h-4" />
                                                    <span>{assigneeOverrides[alert.id] ?? alert.assignee ?? t('alerts.unassigned')}</span>
                                                    <ChevronDown className="w-3 h-3" />
                                                </button>
                                                {assignDropdownId === alert.id && (
                                                    <div className="absolute right-0 top-full mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10">
                                                        <div className="py-1">
                                                            {quickAssignOptions.map((analyst) => (
                                                                <button
                                                                    key={analyst.id}
                                                                    onClick={() => handleAssign(alert.id, analyst.name)}
                                                                    className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                                                                >
                                                                    {analyst.name}
                                                                </button>
                                                            ))}
                                                            <div className="border-t border-slate-700 mt-1 pt-1">
                                                                <button
                                                                    onClick={() => handleAssign(alert.id, '')}
                                                                    className="w-full px-4 py-2 text-left text-sm text-slate-500 hover:bg-slate-700 transition-colors"
                                                                >
                                                                    {t('alerts.unassign')}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <span className="flex items-center gap-2 px-2 py-1 text-slate-500">
                                                <User className="w-4 h-4" />
                                                {alert.assignee ?? t('alerts.unassigned')}
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-3 actions-column">
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onAlertClick?.(alert.id) }}
                                                className="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-blue-400 transition-colors"
                                                title={t('alerts.viewDetails')}
                                            >
                                                <Eye className="w-4 h-4" />
                                            </button>
                                            {canAssign && !(assigneeOverrides[alert.id] ?? alert.assignee) && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        if (user?.username) handleAssign(alert.id, user.username)
                                                    }}
                                                    className="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-green-400 transition-colors"
                                                    title={t('alerts.assignToMe')}
                                                >
                                                    <UserCheck className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button
                                                onClick={(e) => handleFalsePositive(alert.id, e)}
                                                className="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-amber-400 transition-colors"
                                                title={t('alerts.falsePositive')}
                                            >
                                                <Ban className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {onAlertClick && displayedAlerts.length > 0 && (
                <p className="text-xs text-slate-500 text-center mt-4">
                    {t('alerts.clickRow')}
                </p>
            )}
        </div>
    )
}
