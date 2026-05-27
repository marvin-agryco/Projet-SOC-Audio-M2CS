import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Search, Filter, ChevronLeft, ChevronRight, ShieldAlert, LayoutList, LayoutGrid, Clock, Calendar } from 'lucide-react'
import { fetchIncidents, fetchIncident, updateIncident } from '../api'
import { Incident, IncidentStatus } from '../types'
import SeverityBadge from '../components/SeverityBadge'
import StatusBadge from '../components/StatusBadge'
import CustomSelect from '../components/CustomSelect'
import TriageBriefPanel from '../components/TriageBriefPanel'
import { fmtDateTime, fmtDateShort, isToday, timeAgo } from '../utils/dateFormat'

export default function Incidents() {
  const { user } = useAuth()
  const location = useLocation()
  const locationState = location.state as { severity?: string } | null

  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)

  // Filters
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState<string>(locationState?.severity ?? '')
  const [statusFilter, setStatusFilter] = useState<string>('')
  useEffect(() => {
    loadIncidents()
  }, [page, search, severityFilter, statusFilter])

  async function loadIncidents() {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page, per_page: 20 }
      if (severityFilter) params.severity = severityFilter
      if (statusFilter) params.status = statusFilter
      
      const data = await fetchIncidents(params)
      
      // If we have search text, we might need to filter client-side if backend doesn't support search on title yet
      let filteredIncidents = data.incidents
      if (search) {
        const lowerSearch = search.toLowerCase()
        filteredIncidents = filteredIncidents.filter(inc => 
          inc.title.toLowerCase().includes(lowerSearch) || 
          inc.description?.toLowerCase().includes(lowerSearch)
        )
      }

      setIncidents(filteredIncidents)
      setTotalPages(data.pages)
      
      // Refresh selected incident if it's open
      if (selectedIncident) {
        const updated = filteredIncidents.find(i => i.id === selectedIncident.id)
        if (updated) setSelectedIncident(updated)
      }
    } catch (error) {
      console.error('Failed to load incidents:', error)
    } finally {
      setLoading(false)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    loadIncidents()
  }

  async function handleSelectIncident(incident: Incident) {
    setSelectedIncident(incident)
    try {
      const fullIncident = await fetchIncident(incident.id)
      setSelectedIncident(fullIncident)
    } catch (error) {
      console.error('Failed to fetch full incident details:', error)
    }
  }

  async function handleStatusChange(incidentId: string, newStatus: IncidentStatus) {
    try {
      const updated = await updateIncident(incidentId, { status: newStatus })
      setIncidents(incidents.map((i) => (i.id === incidentId ? updated : i)))
      if (selectedIncident?.id === incidentId) {
        // preserve events which might not be returned in the patch response
        setSelectedIncident({ ...updated, events: selectedIncident.events })
      }
    } catch (error) {
      console.error('Failed to update status:', error)
    }
  }

  return (
    <div className="flex gap-6">
      {/* Incidents List */}
      <div className="flex-1">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Incidents</h1>
            {/* View mode toggle */}
            <div className="flex items-center gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
              <button
                onClick={() => setViewMode('list')}
                title="List view"
                className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'hover:bg-slate-700/50'}`}
                style={viewMode !== 'list' ? { color: 'var(--color-text-muted)' } : undefined}
              >
                <LayoutList className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                title="Grid view"
                className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'hover:bg-slate-700/50'}`}
                style={viewMode !== 'grid' ? { color: 'var(--color-text-muted)' } : undefined}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-lg p-4 mb-4 border" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}>
          <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search incidents..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{
                    backgroundColor: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-primary)'
                  }}
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
                { value: 'open', label: 'Open' },
                { value: 'investigating', label: 'Investigating' },
                { value: 'resolved', label: 'Resolved' },
                { value: 'false_positive', label: 'False Positive' },
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

        {/* Incidents List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
          </div>
        ) : incidents.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <ShieldAlert className="w-16 h-16 mx-auto mb-4 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-lg font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>
              No incidents found
            </p>
            <p style={{ color: 'var(--color-text-muted)' }}>
              Adjust your filters or enjoy the quiet
            </p>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-2 xl:grid-cols-3 gap-3' : 'space-y-3'}>
            {incidents.map((incident) => (
              <div
                key={incident.id}
                onClick={() => handleSelectIncident(incident)}
                className={`glass-card p-4 cursor-pointer transition-all hover:bg-slate-800/50 ${
                  selectedIncident?.id === incident.id ? 'ring-2 ring-blue-500' : ''
                }`}
                style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={incident.severity} size="sm" />
                    <span className="text-sm font-medium opacity-70" style={{ color: 'var(--color-text-muted)' }}>
                      #{incident.id.slice(0, 8)}
                    </span>
                  </div>
                  <StatusBadge status={incident.status as any} />
                </div>
                
                <h3 className="font-semibold text-lg mb-2" style={{ color: 'var(--color-text-primary)' }}>
                  {incident.title}
                </h3>
                
                <div className="flex items-center gap-3 text-xs mt-4">
                  <span className="flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                    <ShieldAlert className="w-3.5 h-3.5" />
                    {incident.event_count} Events
                  </span>
                  {isToday(incident.created_at) ? (
                    <span
                      className="flex items-center gap-1 px-2 py-0.5 rounded font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      title={fmtDateTime(incident.created_at)}
                    >
                      <Clock className="w-3 h-3" />
                      {timeAgo(incident.created_at)}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-700/50" style={{ color: 'var(--color-text-muted)' }}>
                      <Calendar className="w-3 h-3" />
                      {fmtDateShort(incident.created_at)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-6">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg disabled:opacity-50 transition-colors"
              style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span style={{ color: 'var(--color-text-muted)' }}>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg disabled:opacity-50 transition-colors"
              style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Incident Detail Panel */}
      {selectedIncident && (
        <div 
          className="w-96 rounded-lg border p-4 h-fit sticky top-6 overflow-y-auto" 
          style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', maxHeight: 'calc(100vh - 48px)' }}
        >
          <div className="flex items-start justify-between mb-4 pb-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>Incident Details</h2>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>ID: {selectedIncident.id}</p>
            </div>
            <button
              onClick={() => setSelectedIncident(null)}
              className="p-1 rounded-lg hover:bg-slate-700/50 transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
            >
              &times;
            </button>
          </div>

          <div className="space-y-5">
            <div className="flex gap-2">
              <SeverityBadge severity={selectedIncident.severity} />
              <StatusBadge status={selectedIncident.status as any} />
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>Title</label>
              <p className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{selectedIncident.title}</p>
            </div>

            {selectedIncident.description && (
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>Description</label>
                <p className="text-sm p-3 rounded-lg" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)' }}>
                  {selectedIncident.description}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>Created At</label>
                {isToday(selectedIncident.created_at) ? (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    title={fmtDateTime(selectedIncident.created_at)}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    {timeAgo(selectedIncident.created_at)}
                  </span>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{fmtDateTime(selectedIncident.created_at)}</p>
                )}
              </div>
              {selectedIncident.updated_at && (
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>Last Updated</label>
                  {isToday(selectedIncident.updated_at) ? (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      title={fmtDateTime(selectedIncident.updated_at)}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      {timeAgo(selectedIncident.updated_at)}
                    </span>
                  ) : (
                    <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{fmtDateTime(selectedIncident.updated_at)}</p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>Total Events</label>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{selectedIncident.event_count}</p>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>Assigned To</label>
                <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{selectedIncident.assigned_to || 'Unassigned'}</p>
              </div>
            </div>

            {/* Status Actions */}
            <div className="pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--color-text-muted)' }}>Update Status</label>
              <div className="flex flex-wrap gap-2">
                {(['new', 'open', 'investigating', 'resolved', 'false_positive'] as IncidentStatus[]).map(
                  (status) => (
                    <button
                      key={status}
                      onClick={() => handleStatusChange(selectedIncident.id, status)}
                      disabled={selectedIncident.status === status}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        selectedIncident.status === status
                          ? 'opacity-50 cursor-not-allowed border'
                          : 'hover:bg-blue-600/20 hover:text-blue-400'
                      }`}
                      style={{
                        backgroundColor: selectedIncident.status === status ? 'var(--color-bg-tertiary)' : 'var(--color-bg-secondary)',
                        color: selectedIncident.status === status ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      {status.replace('_', ' ').toUpperCase()}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Assigned to User */}
            <div className="pt-2">
              <button
                onClick={async () => {
                  try {
                    const newAssignment = selectedIncident.assigned_to ? null : (user?.username || 'current_user')
                    const updated = await updateIncident(selectedIncident.id, { assigned_to: newAssignment })
                    setIncidents(incidents.map((i) => (i.id === selectedIncident.id ? updated : i)))
                    setSelectedIncident({ ...updated, events: selectedIncident.events })
                  } catch (error) {
                    console.error('Failed to update assignment:', error)
                  }
                }}
                className="w-full px-4 py-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {selectedIncident.assigned_to === user?.username ? 'Unassign Me' : (selectedIncident.assigned_to ? 'Take Assignment' : 'Assign to Me')}
              </button>
            </div>
            
            {/* Show recent events */}
            {selectedIncident.events && selectedIncident.events.length > 0 && (
              <div className="pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <label className="text-xs font-medium mb-3 block" style={{ color: 'var(--color-text-muted)' }}>Associated Events ({selectedIncident.events.length})</label>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selectedIncident.events.map(event => (
                    <div key={event.id} className="p-2 rounded-lg border text-xs" style={{ backgroundColor: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border)' }}>
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{event.event_type}</span>
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          {isToday(event.timestamp) ? timeAgo(event.timestamp) : fmtDateShort(event.timestamp)}
                        </span>
                      </div>
                      <p className="opacity-80 line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>{event.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Triage Brief */}
            <TriageBriefPanel
              incidentId={selectedIncident.id}
              analystName={user?.username}
            />
          </div>
        </div>
      )}
    </div>
  )
}
