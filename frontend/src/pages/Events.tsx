import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useRole } from '../context/RoleContext'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../hooks/useSocket'
import clsx from 'clsx'
import { Search, Filter, ChevronLeft, ChevronRight, LayoutList, LayoutGrid, Wand2, Loader2, Download, Radio } from 'lucide-react'
import { fetchEvents, updateEventStatus, explainEvent, deleteEvent, fetchEndpoints, fetchExportSummary, ExportSummary } from '../api'
import { SecurityEvent, EventStatus } from '../types'
import EventCard from '../components/EventCard'
import SeverityBadge from '../components/SeverityBadge'
import StatusBadge from '../components/StatusBadge'
import CustomSelect from '../components/CustomSelect'
import ExportDialog from '../components/ExportDialog'
import { fmtDateTime, fmtTime } from '../utils/dateFormat'
import { groupEvents } from '../utils/eventGroup'

export default function Events() {
  const { canExport, effectiveRole } = useRole()
  const { user } = useAuth()
  const { socket, connected } = useSocket()
  const location = useLocation()
  const locationState = location.state as { site_id?: string; severity?: string } | null

  const [events, setEvents] = useState<SecurityEvent[]>([])
  const [totalEvents, setTotalEvents] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedEvent, setSelectedEvent] = useState<SecurityEvent | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [explaining, setExplaining] = useState(false)
  const [explainError, setExplainError] = useState<string | null>(null)
  const [rowExplainingId, setRowExplainingId] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [newCount, setNewCount] = useState(0)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [summary, setSummary] = useState<ExportSummary | null>(null)

  // Filters — pre-populated from navigation state (e.g. from endpoint "View Logs")
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [search, setSearch] = useState('')
  const [siteIdFilter, setSiteIdFilter] = useState<string>(locationState?.site_id ?? '')
  const [siteOptions, setSiteOptions] = useState<Array<{ value: string; label: string }>>([])
  const [severityFilter, setSeverityFilter] = useState<string>(locationState?.severity ?? '')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [perPage, setPerPage] = useState(20)

  useEffect(() => {
    loadEvents()
    if (page === 1) setNewCount(0)
  }, [page, perPage, search, siteIdFilter, severityFilter, statusFilter, sourceFilter])

  // Global facet counts (refreshed every 30s) — drives header context + dropdown counts
  useEffect(() => {
    let active = true
    const load = () => {
      fetchExportSummary({})
        .then((s) => { if (active) setSummary(s) })
        .catch(() => {})
    }
    load()
    const id = setInterval(load, 30000)
    return () => { active = false; clearInterval(id) }
  }, [])

  // Populate site filter options once
  useEffect(() => {
    fetchEndpoints({ limit: 200 })
      .then((res) => {
        const opts = [{ value: '', label: 'All Sites' }].concat(
          res.endpoints
            .map((e) => ({ value: e.site_id, label: e.site_id }))
            .filter((o, i, arr) => o.value && arr.findIndex(x => x.value === o.value) === i)
            .sort((a, b) => a.label.localeCompare(b.label))
        )
        setSiteOptions(opts)
      })
      .catch(() => setSiteOptions([{ value: '', label: 'All Sites' }]))
  }, [])

  // Realtime: prepend new events when on page 1 and they pass current filters
  useEffect(() => {
    if (!socket) return
    const handler = (event: SecurityEvent) => {
      if (event.event_type === 'keepalive') return
      const matchesSeverity = !severityFilter || event.severity === severityFilter
      const matchesStatus   = !statusFilter   || event.status   === statusFilter
      const matchesSource   = !sourceFilter   || event.source   === sourceFilter
      const matchesSite     = !siteIdFilter   || event.site_id  === siteIdFilter
      if (!(matchesSeverity && matchesStatus && matchesSource && matchesSite)) return

      if (page === 1) {
        setEvents((prev) => {
          if (prev.some((e) => e.id === event.id)) return prev
          return [event, ...prev].slice(0, perPage)
        })
        setNewCount((c) => c + 1)
      } else {
        setNewCount((c) => c + 1)
      }
    }
    socket.on('new_event', handler)
    return () => { socket.off('new_event', handler) }
  }, [socket, page, perPage, severityFilter, statusFilter, sourceFilter, siteIdFilter])

  async function loadEvents() {
    setLoading(true)
    try {
      const data = await fetchEvents({
        page,
        per_page: perPage,
        site_id: siteIdFilter || undefined,
        severity: severityFilter || undefined,
        status: statusFilter || undefined,
        source: sourceFilter || undefined,
        search: search || undefined,
      })
      setEvents(data.events)
      setTotalPages(data.pages)
      setTotalEvents(data.total)
    } catch (error) {
      console.error('Failed to load events:', error)
    } finally {
      setLoading(false)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    loadEvents()
  }

  async function handleDelete(eventId: string) {
    try {
      await deleteEvent(eventId)
      setEvents(events.filter((e) => e.id !== eventId))
      if (selectedEvent?.id === eventId) setSelectedEvent(null)
    } catch (error) {
      console.error('Failed to delete event:', error)
    }
  }

  async function handleRowExplain(event: SecurityEvent) {
    setSelectedEvent(event)
    setExplainError(null)
    setExplanation(null)
    setRowExplainingId(event.id)
    setExplaining(true)
    try {
      const result = await explainEvent(event.id)
      setExplanation(result.explanation)
    } catch {
      setExplainError('Could not generate explanation')
    } finally {
      setExplaining(false)
      setRowExplainingId(null)
    }
  }

  async function handleStatusChange(eventId: string, newStatus: EventStatus) {
    try {
      const updated = await updateEventStatus(eventId, { status: newStatus })
      setEvents(events.map((e) => (e.id === eventId ? updated : e)))
      if (selectedEvent?.id === eventId) {
        setSelectedEvent(updated)
      }
    } catch (error) {
      console.error('Failed to update status:', error)
    }
  }

  // Group events client-side (5 min sliding window). Single events render as a "group of 1".
  const groups = useMemo(() => groupEvents(events), [events])
  const groupedCount = groups.length

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Facet counts: use global summary (snapshot every 30s) — gives users a sense
  // of total volume per facet regardless of currently-applied filters.
  const sevCount = (k: string) => summary?.by_severity?.[k] ?? 0
  const srcCount = (k: string) => summary?.by_source?.[k] ?? 0
  const statCount = (k: string) => summary?.by_status?.[k] ?? 0
  const fmtCount = (n: number) => (n > 999 ? `${(n / 1000).toFixed(1)}k` : String(n))

  return (
    <div className="flex gap-6">
      {/* Events List */}
      <div className="flex-1">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Security Events</h1>
            <span
              title={connected ? 'Realtime connected' : 'Realtime disconnected'}
              className={clsx(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                connected ? 'bg-green-500/15 text-green-400' : 'bg-slate-500/15 text-slate-400'
              )}
            >
              <Radio className={clsx('w-3 h-3', connected && 'animate-pulse')} />
              {connected ? 'LIVE' : 'OFFLINE'}
            </span>
            {/* View mode toggle */}
            <div className="flex items-center gap-1 p-1 bg-gray-800 border border-gray-700 rounded-lg">
              <button
                onClick={() => setViewMode('list')}
                title="List view"
                className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                <LayoutList className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                title="Grid view (4 per row)"
                className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
          {canExport && (
            <button
              onClick={() => setExportOpen(true)}
              disabled={events.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          )}
        </div>

        {/* F-009: Vocabulary subtitle */}
        <p className="text-sm text-slate-400 mb-3">
          Raw events from your monitored infrastructure. Correlated alerts appear in <span className="text-slate-200">Alerts</span>; investigated cases in <span className="text-slate-200">Incidents</span>.
        </p>

        {/* F-005: Volume context */}
        {summary && (
          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400 mb-3">
            <span className="text-slate-300">
              Showing <span className="font-semibold text-white">{totalEvents.toLocaleString()}</span>
              {totalEvents !== summary.total && (
                <> of <span className="font-semibold text-slate-300">{summary.total.toLocaleString()}</span></>
              )} events
            </span>
            {(totalEvents !== summary.total) && (
              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300">filter applied</span>
            )}
            <span className="text-slate-600">·</span>
            <span>
              {Object.entries(summary.by_source)
                .filter(([, n]) => n > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([k, n]) => `${k}: ${fmtCount(n)}`)
                .join(' · ')}
            </span>
            {summary.first_event && summary.last_event && (
              <>
                <span className="text-slate-600">·</span>
                <span>
                  {fmtTime(summary.first_event)} → {fmtTime(summary.last_event)}
                </span>
              </>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="bg-gray-800 rounded-lg p-4 mb-4 border border-gray-700">
          <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search events..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <CustomSelect
              value={severityFilter}
              onChange={(v) => { setSeverityFilter(v); setPage(1) }}
              placeholder="All Severities"
              options={[
                { value: '', label: `All Severities${summary ? ` (${fmtCount(summary.total)})` : ''}` },
                { value: 'critical', label: `Critical${summary ? ` (${fmtCount(sevCount('critical'))})` : ''}` },
                { value: 'high', label: `High${summary ? ` (${fmtCount(sevCount('high'))})` : ''}` },
                { value: 'medium', label: `Medium${summary ? ` (${fmtCount(sevCount('medium'))})` : ''}` },
                { value: 'low', label: `Low${summary ? ` (${fmtCount(sevCount('low'))})` : ''}` },
              ]}
            />

            <CustomSelect
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v); setPage(1) }}
              placeholder="All Status"
              options={[
                { value: '', label: 'All Status' },
                { value: 'new', label: `New${summary ? ` (${fmtCount(statCount('new'))})` : ''}` },
                { value: 'investigating', label: `Investigating${summary ? ` (${fmtCount(statCount('investigating'))})` : ''}` },
                { value: 'resolved', label: `Resolved${summary ? ` (${fmtCount(statCount('resolved'))})` : ''}` },
                { value: 'false_positive', label: `False Positive${summary ? ` (${fmtCount(statCount('false_positive'))})` : ''}` },
              ]}
            />

            <CustomSelect
              value={sourceFilter}
              onChange={(v) => { setSourceFilter(v); setPage(1) }}
              placeholder="All Sources"
              options={[
                { value: '', label: 'All Sources' },
                { value: 'firewall', label: `Firewall${summary ? ` (${fmtCount(srcCount('firewall'))})` : ''}` },
                { value: 'ids', label: `IDS${summary ? ` (${fmtCount(srcCount('ids'))})` : ''}` },
                { value: 'endpoint', label: `Endpoint${summary ? ` (${fmtCount(srcCount('endpoint'))})` : ''}` },
                { value: 'application', label: `Application${summary ? ` (${fmtCount(srcCount('application'))})` : ''}` },
              ]}
            />

            <CustomSelect
              value={siteIdFilter}
              onChange={(v) => { setSiteIdFilter(v); setPage(1) }}
              placeholder="All Sites"
              options={siteOptions.length > 0 ? siteOptions : [{ value: '', label: 'All Sites' }]}
            />

            <CustomSelect
              value={String(perPage)}
              onChange={(v) => { setPerPage(Number(v)); setPage(1) }}
              placeholder="20 / page"
              options={[
                { value: '10', label: '10 / page' },
                { value: '20', label: '20 / page' },
                { value: '50', label: '50 / page' },
                { value: '100', label: '100 / page' },
                { value: '200', label: '200 / page' },
                { value: '500', label: '500 / page' },
              ]}
            />

            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Filter className="w-4 h-4" />
              Filter
            </button>
          </form>
        </div>

        {/* F-008: New events banner */}
        {newCount > 0 && (
          <button
            onClick={() => { setPage(1); setNewCount(0); loadEvents() }}
            className="w-full mb-3 px-4 py-2 bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            +{newCount} new event{newCount === 1 ? '' : 's'} since you arrived — refresh page 1
          </button>
        )}

        {/* Events list (grouped) */}
        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : events.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No events found</div>
        ) : (
          <>
            {groupedCount < events.length && (
              <div className="text-xs text-slate-500 mb-2">
                {events.length} events grouped into {groupedCount} {groupedCount === 1 ? 'card' : 'cards'} (5-minute window). Click <span className="text-blue-300 font-semibold">N×</span> badges to expand.
              </div>
            )}
            <div className={viewMode === 'grid' ? 'grid grid-cols-2 xl:grid-cols-4 gap-3' : 'space-y-2'}>
              {groups.map((g) => {
                const isExpanded = expandedGroups.has(g.key)
                return (
                  <div key={g.key} className="space-y-2">
                    <div className="group">
                      <EventCard
                        event={g.representative}
                        group={g}
                        expanded={isExpanded}
                        onToggleExpand={(e) => { e.stopPropagation(); toggleGroup(g.key) }}
                        onClick={() => { setSelectedEvent(g.representative); setExplanation(null); setExplainError(null) }}
                        onDelete={(e) => { e.stopPropagation(); handleDelete(g.representative.id) }}
                        onExplain={(e) => { e.stopPropagation(); handleRowExplain(g.representative) }}
                        explaining={rowExplainingId === g.representative.id}
                      />
                    </div>
                    {isExpanded && g.count > 1 && (
                      <div className="pl-4 border-l-2 border-blue-500/30 space-y-2">
                        {g.events.map((child) => (
                          <div key={child.id} className="group">
                            <EventCard
                              event={child}
                              onClick={() => { setSelectedEvent(child); setExplanation(null); setExplainError(null) }}
                              onDelete={(e) => { e.stopPropagation(); handleDelete(child.id) }}
                              onExplain={(e) => { e.stopPropagation(); handleRowExplain(child) }}
                              explaining={rowExplainingId === child.id}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-gray-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Event Detail Panel */}
      {selectedEvent && (
        <div className="w-96 bg-gray-800 rounded-lg border border-gray-700 p-4 h-fit sticky top-6">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-lg font-semibold">Event Details</h2>
            <button
              onClick={() => setSelectedEvent(null)}
              className="text-gray-400 hover:text-white"
            >
              &times;
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex gap-2">
              <SeverityBadge severity={selectedEvent.severity} />
              <StatusBadge status={selectedEvent.status} />
            </div>

            <div>
              <label className="text-gray-400 text-sm">Type</label>
              <p className="font-medium">{selectedEvent.event_type}</p>
            </div>

            <div>
              <label className="text-gray-400 text-sm">Source</label>
              <p>{selectedEvent.source}</p>
            </div>

            <div>
              <label className="text-gray-400 text-sm">Timestamp</label>
              <p>{fmtDateTime(selectedEvent.timestamp)}</p>
            </div>

            {selectedEvent.site_id && (
              <div>
                <label className="text-gray-400 text-sm">Site</label>
                <p className="text-blue-400">{selectedEvent.site_id}</p>
              </div>
            )}

            <div>
              <label className="text-gray-400 text-sm">Description</label>
              <p className="text-sm">{selectedEvent.description}</p>
            </div>

            {selectedEvent.raw_log && (
              <div>
                <label className="text-gray-400 text-sm">Raw Log</label>
                <pre className="text-xs bg-gray-900 p-2 rounded overflow-x-auto">
                  {selectedEvent.raw_log}
                </pre>
                {!explanation && (
                  <button
                    onClick={async () => {
                      setExplaining(true)
                      setExplainError(null)
                      try {
                        const result = await explainEvent(selectedEvent.id)
                        setExplanation(result.explanation)
                      } catch {
                        setExplainError('Could not generate explanation')
                      } finally {
                        setExplaining(false)
                      }
                    }}
                    disabled={explaining}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg mt-2 transition-colors disabled:opacity-50 bg-violet-500/15 text-violet-300 hover:bg-violet-500/25"
                  >
                    {explaining
                      ? <><Loader2 className="w-3 h-3 animate-spin" /> Explaining...</>
                      : <><Wand2 className="w-3 h-3" /> Explain this log</>}
                  </button>
                )}
                {explanation && (
                  <div
                    className="mt-2 p-2.5 rounded-lg text-xs leading-relaxed border-l-2 border-violet-500"
                    style={{
                      backgroundColor: 'rgb(139 92 246 / 0.10)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    <span className="font-medium" style={{ color: '#a78bfa' }}>AI: </span>
                    {explanation}
                  </div>
                )}
                {explainError && (
                  <p className="text-xs mt-1 text-red-400">{explainError}</p>
                )}
              </div>
            )}

            {/* Status Actions */}
            <div>
              <label className="text-gray-400 text-sm mb-2 block">Update Status</label>
              <div className="flex flex-wrap gap-2">
                {(['new', 'investigating', 'resolved', 'false_positive'] as EventStatus[]).map(
                  (status) => (
                    <button
                      key={status}
                      onClick={() => handleStatusChange(selectedEvent.id, status)}
                      disabled={selectedEvent.status === status}
                      className={`px-3 py-1 rounded text-sm ${
                        selectedEvent.status === status
                          ? 'bg-gray-600 cursor-not-allowed'
                          : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      {status.replace('_', ' ')}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        pageEvents={events}
        currentFilters={{
          severity: severityFilter || undefined,
          status: statusFilter || undefined,
          source: sourceFilter || undefined,
          site_id: siteIdFilter || undefined,
          search: search || undefined,
        }}
        analyst={user?.username || 'Unknown'}
        role={effectiveRole}
      />
    </div>
  )
}
