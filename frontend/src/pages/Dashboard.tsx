import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, AlertTriangle, Monitor, Users, Radio, Pause, ShieldAlert } from 'lucide-react'
import { fetchDashboardStats, fetchDashboardTrendsWithRange, fetchEvents, fetchDashboardHeatmap } from '../api'
import { DashboardStats, SecurityEvent, HeatmapEntry } from '../types'
import StatCard from '../components/StatCard'
import EventVolumeChart from '../components/EventVolumeChart'
import AlertsBySourceChart from '../components/AlertsBySourceChart'
import RecentAlertsTable from '../components/RecentAlertsTable'
import EndpointStatusCard from '../components/EndpointStatusCard'
import AlertDetailModal from '../components/AlertDetailModal'
import SourcesPanel from '../components/SourcesPanel'
import SeverityTrendChart from '../components/SeverityTrendChart'
import ActivityHeatmap from '../components/ActivityHeatmap'
import TopSourceIPs from '../components/TopSourceIPs'
import { ToastContainer, toast } from '../components/Toast'
import { useLanguage } from '../context/LanguageContext'
import clsx from 'clsx'

interface DashboardProps {
  realtimeEvents: SecurityEvent[]
}

type TimeRange = '5m' | '15m' | '30m' | '1h' | '6h' | '24h' | '7d' | '30d'

// Source colors for donut chart — matches real infrastructure
const SOURCE_COLORS: Record<string, string> = {
  firewall: '#ef4444',    // red
  endpoint: '#3b82f6',    // blue
  application: '#f59e0b', // amber (GLPI)
  ids: '#8b5cf6',         // purple (Suricata)
}

export default function Dashboard({ realtimeEvents }: DashboardProps) {
  const navigate = useNavigate()
  const { t, locale } = useLanguage()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [trends, setTrends] = useState<{
    hourly: Array<{ hour: string; count: number }>
    daily: Array<{ date: string; critical: number; high: number; medium: number; low: number }>
  } | null>(null)
  const [heatmapData, setHeatmapData] = useState<HeatmapEntry[]>([])
  const [criticalAlerts, setCriticalAlerts] = useState<SecurityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [chartLoading, setChartLoading] = useState(false)

  // Interactive state
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')
  const [selectedSource, setSelectedSource] = useState<string | null>(null)
  const [selectedSourceLabel, setSelectedSourceLabel] = useState<string | null>(null)
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null)
  const [alertModalOpen, setAlertModalOpen] = useState(false)
  const [isLiveMode, setIsLiveMode] = useState(true)
  const [refreshCounter, setRefreshCounter] = useState(0)

  const [heatmapDays, setHeatmapDays] = useState(30)
  const [timeSlice, setTimeSlice] = useState<{start: string, end: string} | null>(null)
  const [sourcePanelOpen, setSourcePanelOpen] = useState(false)

  const loadData = useCallback(async (
    currentTimeRange: TimeRange = timeRange,
    currentTimeSlice = timeSlice
  ) => {
    try {
      const fetchEventsParams: any = { severity: 'critical,high', status: 'new', limit: 10 }
      if (currentTimeSlice) {
        fetchEventsParams.start_time = currentTimeSlice.start
        fetchEventsParams.end_time = currentTimeSlice.end
      }

      const [statsData, trendsData, eventsData] = await Promise.all([
        fetchDashboardStats(),
        fetchDashboardTrendsWithRange(currentTimeRange),
        fetchEvents(fetchEventsParams),
      ])
      setStats(statsData)
      setTrends(trendsData)
      setCriticalAlerts(eventsData.events || [])
      setRefreshCounter((c: number) => c + 1)
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }, [timeRange, timeSlice])

  // Heatmap has its own independent fetch — only re-runs when heatmapDays changes
  useEffect(() => {
    fetchDashboardHeatmap(heatmapDays)
      .then((result: any) => setHeatmapData(result.heatmap || []))
      .catch((err: any) => console.error('Failed to load heatmap:', err))
  }, [heatmapDays])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Live mode auto-refresh
  useEffect(() => {
    if (!isLiveMode) return

    const interval = setInterval(() => {
      loadData()
    }, 10000) // Refresh every 10 seconds in live mode

    return () => clearInterval(interval)
  }, [isLiveMode, loadData])

  // Handle time range change
  const handleTimeRangeChange = async (range: TimeRange) => {
    setTimeRange(range)
    setChartLoading(true)
    try {
      const trendsData = await fetchDashboardTrendsWithRange(range)
      setTrends(trendsData)
    } catch (error) {
      console.error('Failed to load trends:', error)
    } finally {
      setChartLoading(false)
    }
  }

  // Handle source selection from pie chart
  const handleSourceSelect = (source: string | null, sourceName: string | null) => {
    setSelectedSource(source)
    setSelectedSourceLabel(sourceName)
    if (source) {
      toast.info(`${t('common.filteringBy')} ${sourceName}`)
    }
  }

  const handleTimeSliceSelect = (start: string, end: string) => {
    if (start && end) {
      setTimeSlice({ start, end })
    } else {
      setTimeSlice(null)
    }
  }

  // Handle alert click
  const handleAlertClick = (alertId: string) => {
    setSelectedAlertId(alertId)
    setAlertModalOpen(true)
  }

  // Handle live mode toggle
  const toggleLiveMode = () => {
    setIsLiveMode(!isLiveMode)
    if (!isLiveMode) {
      toast.success(t('common.liveEnabled'))
    } else {
      toast.info(t('common.liveDisabled'))
    }
  }

  // Handle chart point click
  const handleChartPointClick = (time: string, value: number) => {
    toast.info(`${t('common.showingEvents')} ${value} ${t('eventVolume.events')} ${t('common.eventsAt')} ${time}`)
    navigate(`/events?time=${time}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
      </div>
    )
  }

  // Transform hourly trends to chart format
  const eventVolumeData = trends?.hourly?.map((h: { hour: string; count: number }) => ({
    time: h.hour,
    value: h.count,
  })) || []

  // Transform source data to pie chart format with sourceKey
  const alertsBySourceData = stats?.by_source
    ? Object.entries(stats.by_source).map(([name, value]) => ({
      name: formatSourceName(name),
      value: value as number,
      color: SOURCE_COLORS[name] || '#64748b',
      sourceKey: name,
    }))
    : []

  // Transform recent alerts to table format with sourceKey + grouping
  const rawAlerts = [...realtimeEvents, ...criticalAlerts]
    .filter((e) => e.severity === 'critical' || e.severity === 'high')
    .map((e) => ({
      id: e.id,
      severity: e.severity,
      alertName: e.description,
      source: e.site_id || formatSourceName(e.source),
      sourceKey: e.source,
      time: new Date(e.timestamp).toLocaleTimeString(locale(), {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      assignee: e.assigned_to,
      count: 1,
    }))

  // Group by alertName + source to reduce alert fatigue
  const groupedMap = new Map<string, typeof rawAlerts[0]>()
  for (const alert of rawAlerts) {
    const key = `${alert.alertName}::${alert.sourceKey || alert.source}`
    const existing = groupedMap.get(key)
    if (existing) {
      existing.count += 1
    } else {
      groupedMap.set(key, { ...alert })
    }
  }
  const recentAlerts = Array.from(groupedMap.values()).slice(0, 10)

  // Trend indicators: % change vs previous 24h
  const eventsTrend = stats?.events_prev_24h
    ? Math.round(((stats.events_last_24h - stats.events_prev_24h) / stats.events_prev_24h) * 100)
    : null

  return (
    <div className="space-y-6">
      {/* Toast container for notifications */}
      <ToastContainer />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{t('dashboard.securityOverview')}</h1>
          <p className="text-slate-400 text-sm mt-1">
            {t('dashboard.realtimeStatus')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Live View Toggle Button */}
          <button
            onClick={toggleLiveMode}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-all',
              isLiveMode
                ? 'bg-green-600 text-white shadow-lg shadow-green-600/30'
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
            )}
          >
            {isLiveMode ? (
              <>
                <Radio className="w-4 h-4 live-glow" />
                <span>{t('dashboard.live')}</span>
              </>
            ) : (
              <>
                <Pause className="w-4 h-4" />
                <span>{t('dashboard.paused')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          icon={<Activity className="w-6 h-6" />}
          label={t('dashboard.securityEvents')}
          value={stats?.total_events ?? 0}
          trend={eventsTrend !== null ? { value: Math.abs(eventsTrend), isPositive: eventsTrend <= 0, severity: Math.abs(eventsTrend) > 100 ? 'critical' : Math.abs(eventsTrend) > 50 ? 'warning' : 'normal' } : undefined}
          sparklineData={trends?.hourly?.map((h: { count: number }) => h.count) || []}
          statusColor="normal"
          linkTo="/events"
        />
        <StatCard
          icon={<AlertTriangle className="w-6 h-6" />}
          label={t('dashboard.alertsTriggered')}
          value={stats?.total_rule_triggers ?? 0}
          subValue={
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span>{stats?.by_severity?.critical || 0} Critical</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span>{stats?.by_severity?.high || 0} High</span>
            </div>
          }
          statusColor={(stats?.total_rule_triggers || 0) > 100 ? 'critical' : (stats?.total_rule_triggers || 0) > 50 ? 'warning' : 'normal'}
          linkTo="/alerts"
        />
        <StatCard
          icon={<ShieldAlert className="w-6 h-6" />}
          label={t('dashboard.openIncidents')}
          value={stats?.open_incidents ?? 0}
          subValue="Avg. Time to Resolve: 12m"
          statusColor={(stats?.open_incidents || 0) > 0 ? 'critical' : 'success'}
          linkTo="/incidents"
        />
        <StatCard
          icon={<Monitor className="w-6 h-6" />}
          label={t('dashboard.endpoints')}
          value={stats?.total_sites ?? 0}
          subValue="All agents reporting"
          statusColor="success"
          linkTo="/sites"
        />
        <StatCard
          icon={<Users className="w-6 h-6" />}
          label={t('dashboard.sources')}
          value={`${stats?.by_source ? Object.keys(stats.by_source).length : 0} / 4`}
          subValue="Ingestion: 1.2 MB/s"
          statusColor={(stats?.by_source && Object.keys(stats.by_source).length < 4) ? 'warning' : 'normal'}
          onClick={() => setSourcePanelOpen(true)}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <EventVolumeChart
            data={eventVolumeData}
            timeRange={timeRange}
            onTimeRangeChange={handleTimeRangeChange}
            onDataPointClick={handleChartPointClick}
            loading={chartLoading}
          />
        </div>
        <div>
          <AlertsBySourceChart
            data={alertsBySourceData}
            onSourceSelect={handleSourceSelect}
            selectedSource={selectedSource}
          />
        </div>
      </div>

      {/* Severity Trend (visible uniquement pour 7d/30d) */}
      {(timeRange === '7d' || timeRange === '30d') && (
        <SeverityTrendChart data={trends?.daily ?? []} loading={chartLoading} />
      )}

      {/* Recent Alerts Table + Endpoint Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <RecentAlertsTable
            alerts={recentAlerts}
            isLive={isLiveMode}
            onAlertClick={handleAlertClick}
            filteredSource={selectedSource}
            filterLabel={selectedSourceLabel || undefined}
          />
          
          <ActivityHeatmap 
            data={heatmapData} 
            loading={loading}
            days={heatmapDays}
            onTimeRangeChange={setHeatmapDays}
            onTimeSliceSelect={handleTimeSliceSelect}
          />
        </div>
        <div className="space-y-4">
          <EndpointStatusCard maxDisplay={5} />
          <TopSourceIPs refreshTrigger={refreshCounter} />
        </div>
      </div>

      {/* Alert Detail Modal */}
      <AlertDetailModal
        eventId={selectedAlertId}
        isOpen={alertModalOpen}
        onClose={() => setAlertModalOpen(false)}
        onUpdate={(updatedEvent) => {
          // Update the local state with the updated event
          setCriticalAlerts((prev) =>
            prev.map((e) => (e.id === updatedEvent.id ? updatedEvent : e))
          )
        }}
      />

      {/* Sources Detail Panel */}
      <SourcesPanel isOpen={sourcePanelOpen} onClose={() => setSourcePanelOpen(false)} />
    </div>
  )
}

// Helper functions
function formatSourceName(source: string): string {
  const names: Record<string, string> = {
    firewall: 'Firewall',
    endpoint: 'Endpoints',
    application: 'GLPI',
    ids: 'IDS / Suricata',
  }
  return names[source] || source.charAt(0).toUpperCase() + source.slice(1)
}

