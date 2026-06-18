import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Server, Activity, AlertTriangle, ChevronRight, RefreshCw, FileText, Search } from 'lucide-react'
import clsx from 'clsx'
import Modal from './Modal'
import { Endpoint, EndpointStatus as EndpointStatusType } from '../types'
import { fetchSitesSummary } from '../api'
import { useLanguage } from '../context/LanguageContext'

interface EndpointStatusCardProps {
    endpoints?: Endpoint[]
    loading?: boolean
    onEndpointClick?: (endpoint: Endpoint) => void
    maxDisplay?: number
}

const statusConfig: Record<EndpointStatusType, { color: string; bg: string; label: string }> = {
    online: { color: 'text-green-400', bg: 'bg-green-500', label: 'Online' },
    offline: { color: 'text-red-400', bg: 'bg-red-500', label: 'Offline' },
    degraded: { color: 'text-yellow-400', bg: 'bg-yellow-500', label: 'Degraded' },
}

interface EndpointDetailModalProps {
    endpoint: Endpoint | null
    isOpen: boolean
    onClose: () => void
}

function EndpointDetailModal({ endpoint, isOpen, onClose }: EndpointDetailModalProps) {
    const navigate = useNavigate()
    const { t, locale } = useLanguage()

    if (!endpoint) return null

    const config = statusConfig[endpoint.status]

    function handleViewLogs() {
        onClose()
        navigate('/events', { state: { site_id: endpoint!.site_id } })
    }

    function handleInvestigate() {
        onClose()
        navigate('/events', { state: { site_id: endpoint!.site_id, severity: 'critical,high' } })
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={endpoint.name} size="lg">
            <div className="p-6 space-y-6">
                {/* Status header */}
                <div className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg">
                    <div className="flex items-center gap-3">
                        <div className={clsx('w-3 h-3 rounded-full', config.bg)} />
                        <span className={clsx('font-medium', config.color)}>{config.label}</span>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-bold text-slate-100">{endpoint.health}%</p>
                        <p className="text-xs text-slate-500">{t('endpoints.healthScore')}</p>
                    </div>
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-700/30 rounded-lg">
                        <p className="text-xs text-slate-500 mb-1">{t('endpoints.siteId')}</p>
                        <p className="font-mono text-slate-200">{endpoint.site_id}</p>
                    </div>
                    <div className="p-4 bg-slate-700/30 rounded-lg">
                        <p className="text-xs text-slate-500 mb-1">{t('endpoints.ipAddress')}</p>
                        <p className="font-mono text-slate-200">{endpoint.ip_address}</p>
                    </div>
                    <div className="p-4 bg-slate-700/30 rounded-lg">
                        <p className="text-xs text-slate-500 mb-1">{t('endpoints.location')}</p>
                        <p className="text-slate-200">{endpoint.location}</p>
                    </div>
                    <div className="p-4 bg-slate-700/30 rounded-lg">
                        <p className="text-xs text-slate-500 mb-1">{t('endpoints.lastSeen')}</p>
                        <p className="text-slate-200">
                            {endpoint.last_seen ? new Date(endpoint.last_seen).toLocaleString(locale()) : '—'}
                        </p>
                    </div>
                    <div className="p-4 bg-slate-700/30 rounded-lg">
                        <p className="text-xs text-slate-500 mb-1">{t('endpoints.events24h')}</p>
                        <p className="text-slate-200">{endpoint.event_count_24h}</p>
                    </div>
                    <div className="p-4 bg-slate-700/30 rounded-lg">
                        <p className="text-xs text-slate-500 mb-1">{t('endpoints.criticalAlerts')}</p>
                        <p className={clsx(
                            'font-medium',
                            endpoint.critical_alerts > 0 ? 'text-red-400' : 'text-green-400'
                        )}>
                            {endpoint.critical_alerts}
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div>
                    <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">
                        {t('endpoints.quickActions')}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={handleViewLogs} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors">
                            <FileText className="w-4 h-4" />
                            {t('endpoints.viewLogs')}
                        </button>
                        <button className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors">
                            <RefreshCw className="w-4 h-4" />
                            {t('endpoints.restartServices')}
                        </button>
                        <button onClick={handleInvestigate} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors">
                            <Search className="w-4 h-4" />
                            {t('endpoints.investigate')}
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    )
}

function sitesToEndpoints(sites: Array<{ site_id: string; total: number; critical: number; high: number }>): Endpoint[] {
    return sites.map((site) => {
        const hasCritical = site.critical > 0
        const hasHigh = site.high > 0
        const status: EndpointStatusType = hasCritical ? 'offline' : hasHigh ? 'degraded' : 'online'
        const health = hasCritical ? 30 : hasHigh ? 60 : 95

        return {
            id: site.site_id,
            site_id: site.site_id,
            name: site.site_id,
            location: '',
            ip_address: '',
            status,
            health,
            last_seen: new Date().toISOString(),
            event_count_24h: site.total,
            critical_alerts: site.critical,
            type: 'center',
        }
    })
}

export default function EndpointStatusCard({
    endpoints: propEndpoints,
    loading: propLoading = false,
    onEndpointClick,
    maxDisplay = 5,
}: EndpointStatusCardProps) {
    const navigate = useNavigate()
    const { t } = useLanguage()
    const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint | null>(null)
    const [modalOpen, setModalOpen] = useState(false)
    const [fetchedEndpoints, setFetchedEndpoints] = useState<Endpoint[]>([])
    const [loading, setLoading] = useState(propLoading)

    useEffect(() => {
        if (!propEndpoints) {
            setLoading(true)
            fetchSitesSummary()
                .then((data) => {
                    setFetchedEndpoints(sitesToEndpoints(data.sites || []))
                })
                .catch(() => setFetchedEndpoints([]))
                .finally(() => setLoading(false))
        }
    }, [propEndpoints])

    const endpoints = propEndpoints || fetchedEndpoints
    const displayedEndpoints = endpoints.slice(0, maxDisplay)

    // Calculate stats
    const onlineCount = endpoints.filter((e) => e.status === 'online').length
    const degradedCount = endpoints.filter((e) => e.status === 'degraded').length
    const offlineCount = endpoints.filter((e) => e.status === 'offline').length

    const handleEndpointClick = (endpoint: Endpoint) => {
        if (onEndpointClick) {
            onEndpointClick(endpoint)
        } else {
            setSelectedEndpoint(endpoint)
            setModalOpen(true)
        }
    }

    return (
        <>
            <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <Server className="w-5 h-5 text-slate-400" />
                        <h3 className="text-lg font-semibold text-slate-100">
                            {t('endpoints.title')}
                        </h3>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-green-500" />
                            <span className="text-slate-400">{onlineCount} {t('endpoints.online')}</span>
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-yellow-500" />
                            <span className="text-slate-400">{degradedCount} {t('endpoints.degraded')}</span>
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-red-500" />
                            <span className="text-slate-400">{offlineCount} {t('endpoints.offline')}</span>
                        </span>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center h-48">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
                    </div>
                ) : endpoints.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-slate-500">
                        {t('endpoints.noEndpoints')}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {displayedEndpoints.map((endpoint) => {
                            const config = statusConfig[endpoint.status]
                            return (
                                <div
                                    key={endpoint.id}
                                    onClick={() => handleEndpointClick(endpoint)}
                                    className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 cursor-pointer transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={clsx('w-2.5 h-2.5 rounded-full', config.bg)} />
                                        <div>
                                            <p className="font-medium text-slate-200 group-hover:text-white transition-colors">
                                                {endpoint.name}
                                            </p>
                                            {endpoint.status === 'offline' && (
                                                <p className="text-xs text-red-400/70">
                                                    {endpoint.critical_alerts} {t('endpoints.criticalDetected')}
                                                </p>
                                            )}
                                            {endpoint.status === 'degraded' && (
                                                <p className="text-xs text-yellow-400/70">
                                                    {endpoint.event_count_24h} {t('endpoints.events')}, {endpoint.critical_alerts > 0 ? `${endpoint.critical_alerts} critical` : t('endpoints.criticalHighAlerts')}
                                                </p>
                                            )}
                                            {endpoint.status === 'online' && endpoint.location && (
                                                <p className="text-xs text-slate-500">{endpoint.location}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <div className="flex items-center gap-1">
                                                <Activity className="w-3 h-3 text-slate-500" />
                                                <span className="text-sm text-slate-400">
                                                    {endpoint.event_count_24h} {t('endpoints.events')}
                                                </span>
                                            </div>
                                            {endpoint.critical_alerts > 0 && (
                                                <div className="flex items-center gap-1 text-red-400">
                                                    <AlertTriangle className="w-3 h-3" />
                                                    <span className="text-xs">{endpoint.critical_alerts} alerts</span>
                                                </div>
                                            )}
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                {endpoints.length > maxDisplay && (
                    <button onClick={() => navigate('/sites')} className="w-full mt-3 py-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
                        {t('endpoints.viewAll')} {endpoints.length} endpoints
                    </button>
                )}
            </div>

            <EndpointDetailModal
                endpoint={selectedEndpoint}
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
            />
        </>
    )
}
