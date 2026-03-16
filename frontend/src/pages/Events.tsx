import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useRole } from '../context/RoleContext'
import { Search, Filter, ChevronLeft, ChevronRight, LayoutList, LayoutGrid, Wand2, Loader2 } from 'lucide-react'
import { fetchEvents, updateEventStatus, explainEvent } from '../api'
import { SecurityEvent, EventStatus } from '../types'
import EventCard from '../components/EventCard'
import SeverityBadge from '../components/SeverityBadge'
import StatusBadge from '../components/StatusBadge'
import CustomSelect from '../components/CustomSelect'
import ExportButton from '../components/ExportButton'
import { exportEventsToCSV, exportEventsReport, exportToJSON } from '../utils/export'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function Events() {
  const { canExport } = useRole()
  const location = useLocation()
  const locationState = location.state as { site_id?: string; severity?: string } | null

  const [events, setEvents] = useState<SecurityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedEvent, setSelectedEvent] = useState<SecurityEvent | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [explaining, setExplaining] = useState(false)
  const [explainError, setExplainError] = useState<string | null>(null)

  // Filters — pre-populated from navigation state (e.g. from endpoint "View Logs")
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [search, setSearch] = useState('')
  const [siteIdFilter] = useState<string>(locationState?.site_id ?? '')
  const [severityFilter, setSeverityFilter] = useState<string>(locationState?.severity ?? '')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [perPage, setPerPage] = useState(20)

  useEffect(() => {
    loadEvents()
  }, [page, perPage, search, siteIdFilter, severityFilter, statusFilter, sourceFilter])

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

  return (
    <div className="flex gap-6">
      {/* Events List */}
      <div className="flex-1">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Security Events</h1>
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
            <ExportButton
              onExport={(format) => {
                const stats = {
                  total: events.length,
                  critical: events.filter((e) => e.severity === 'critical').length,
                  high: events.filter((e) => e.severity === 'high').length,
                  medium: events.filter((e) => e.severity === 'medium').length,
                  low: events.filter((e) => e.severity === 'low').length,
                }
                if (format === 'csv') {
                  exportEventsToCSV(events, `security-events-${new Date().toISOString().split('T')[0]}`)
                } else if (format === 'pdf') {
                  exportEventsReport(events, stats)
                } else if (format === 'json') {
                  exportToJSON(events, `security-events-${new Date().toISOString().split('T')[0]}`)
                }
              }}
              formats={['csv', 'pdf', 'json']}
              disabled={events.length === 0}
            />
          )}
        </div>

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
                { value: '', label: 'All Severities' },
                { value: 'critical', label: 'Critical' },
                { value: 'high', label: 'High' },
                { value: 'medium', label: 'Medium' },
                { value: 'low', label: 'Low' },
              ]}
            />

            <CustomSelect
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v); setPage(1) }}
              placeholder="All Status"
              options={[
                { value: '', label: 'All Status' },
                { value: 'new', label: 'New' },
                { value: 'investigating', label: 'Investigating' },
                { value: 'resolved', label: 'Resolved' },
                { value: 'false_positive', label: 'False Positive' },
              ]}
            />

            <CustomSelect
              value={sourceFilter}
              onChange={(v) => { setSourceFilter(v); setPage(1) }}
              placeholder="All Sources"
              options={[
                { value: '', label: 'All Sources' },
                { value: 'firewall', label: 'Firewall' },
                { value: 'ids', label: 'IDS' },
                { value: 'endpoint', label: 'Endpoint' },
                { value: 'application', label: 'Application' },
              ]}
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

        {/* Events List */}
        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : events.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No events found</div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-2 xl:grid-cols-4 gap-3' : 'space-y-2'}>
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onClick={() => { setSelectedEvent(event); setExplanation(null); setExplainError(null) }}
              />
            ))}
          </div>
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
              <p>{format(new Date(selectedEvent.timestamp), 'PPpp', { locale: fr })}</p>
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
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg mt-2 transition-colors disabled:opacity-50"
                    style={{ backgroundColor: 'rgb(139 92 246 / 0.15)', color: '#a78bfa' }}
                  >
                    {explaining
                      ? <><Loader2 className="w-3 h-3 animate-spin" /> Explaining...</>
                      : <><Wand2 className="w-3 h-3" /> Explain this log</>}
                  </button>
                )}
                {explanation && (
                  <div
                    className="mt-2 p-2.5 rounded-lg text-xs leading-relaxed"
                    style={{ backgroundColor: 'rgb(139 92 246 / 0.08)', borderLeft: '2px solid #6366f1', color: 'var(--color-text-primary)' }}
                  >
                    <span className="font-medium" style={{ color: 'var(--color-text-muted)' }}>AI: </span>
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
    </div>
  )
}
