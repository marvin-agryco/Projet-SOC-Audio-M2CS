import axios from 'axios'
import { SecurityEvent, AlertRule, DashboardStats, SiteSummary, Endpoint, AlertComment, Analyst, Playbook, PlaybookExecution, GLPIAsset, Incident, HeatmapEntry, TopIP, SourceDetail, TriageBrief } from './types'

// ── Module-level client cache ─────────────────────────────────────────────────
// Survives React component unmounts — data persists for the lifetime of the SPA
// session. Navigating away and back returns cached data instantly (no spinner).
interface _CacheEntry<T> { data: T; ts: number; ttl: number }
const _cache = new Map<string, _CacheEntry<unknown>>()

function _cached<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  const entry = _cache.get(key) as _CacheEntry<T> | undefined
  if (entry && Date.now() - entry.ts < entry.ttl) return Promise.resolve(entry.data)
  return fetcher().then(data => {
    _cache.set(key, { data, ts: Date.now(), ttl })
    return data
  })
}

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Events
export async function fetchEvents(params?: {
  page?: number
  per_page?: number
  limit?: number
  status?: string
  severity?: string
  source?: string
  site_id?: string
  search?: string
}): Promise<{ events: SecurityEvent[]; total: number; pages: number }> {
  const { data } = await api.get('/events', { params })
  return data
}

export async function fetchEvent(id: string): Promise<SecurityEvent> {
  const { data } = await api.get(`/events/${id}`)
  return data
}

export async function updateEventStatus(
  id: string,
  payload: { status?: string; assigned_to?: string }
): Promise<SecurityEvent> {
  const { data } = await api.patch(`/events/${id}/status`, payload)
  return data
}

// Dashboard
export async function fetchDashboardStats(): Promise<DashboardStats> {
  const { data } = await api.get('/dashboard/stats')
  return data
}

export async function fetchDashboardTrends(): Promise<{
  hourly: Array<{ hour: string; count: number }>
  daily: Array<{ date: string; critical: number; high: number; medium: number; low: number }>
}> {
  const { data } = await api.get('/dashboard/trends')
  return data
}

export async function fetchSitesSummary(): Promise<{ sites: SiteSummary[] }> {
  const { data } = await api.get('/dashboard/sites')
  return data
}

// Alert Rules
export async function fetchAlertRules(): Promise<{ rules: AlertRule[]; total: number }> {
  const { data } = await api.get('/alerts/rules')
  return data
}

export async function createAlertRule(
  rule: Omit<AlertRule, 'id' | 'created_at' | 'last_triggered' | 'trigger_count'>
): Promise<AlertRule> {
  const { data } = await api.post('/alerts/rules', rule)
  return data
}

export async function updateAlertRule(
  id: string,
  updates: Partial<AlertRule>
): Promise<AlertRule> {
  const { data } = await api.patch(`/alerts/rules/${id}`, updates)
  return data
}

export async function deleteEvent(id: string): Promise<void> {
  await api.delete(`/events/${id}`)
}

export interface ExportFilters {
  status?: string
  severity?: string
  source?: string
  site_id?: string
  search?: string
  start?: string
  end?: string
  max_rows?: number
}

export interface ExportSummary {
  total: number
  by_severity: Record<string, number>
  by_status: Record<string, number>
  by_source: Record<string, number>
  first_event: string | null
  last_event: string | null
  generated_at: string
  filters: Record<string, string>
}

export async function fetchExportSummary(filters: ExportFilters): Promise<ExportSummary> {
  const { data } = await api.get('/events/export/summary', { params: filters })
  return data
}

export async function fetchEventsExport(filters: ExportFilters): Promise<SecurityEvent[]> {
  const { data } = await api.get('/events/export', {
    params: { ...filters, format: 'json' },
  })
  return data.events
}

export function buildExportCsvUrl(filters: ExportFilters): string {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.append(k, String(v))
  })
  params.set('format', 'csv')
  return `/api/events/export?${params.toString()}`
}

export async function deleteAlertRule(id: string): Promise<void> {
  await api.delete(`/alerts/rules/${id}`)
}

export async function toggleAlertRule(id: string): Promise<AlertRule> {
  const { data } = await api.post(`/alerts/rules/${id}/toggle`)
  return data
}

// Endpoints
export async function fetchEndpoints(params?: {
  status?: string
  limit?: number
}): Promise<{ endpoints: Endpoint[]; total: number }> {
  const { data } = await api.get('/endpoints', { params })
  return data
}

export async function fetchEndpoint(id: string): Promise<Endpoint> {
  const { data } = await api.get(`/endpoints/${id}`)
  return data
}

// Event Comments
export async function fetchEventComments(eventId: string): Promise<{ comments: AlertComment[] }> {
  const { data } = await api.get(`/events/${eventId}/comments`)
  return data
}

export async function addEventComment(eventId: string, content: string): Promise<AlertComment> {
  const { data } = await api.post(`/events/${eventId}/comments`, { content })
  return data
}

// Analysts
export async function fetchAnalysts(): Promise<{ analysts: Analyst[] }> {
  const { data } = await api.get('/analysts')
  return data
}

// Assets (GLPI) — cached 5 min client-side (matches server cache TTL)
export function fetchAssets(): Promise<{ assets: GLPIAsset[]; total: number }> {
  return _cached('assets', 5 * 60 * 1000, () => api.get('/assets').then(r => r.data))
}

export async function fetchAssetByName(name: string): Promise<Record<string, unknown>> {
  const { data } = await api.get(`/assets/${encodeURIComponent(name)}`)
  return data
}

// Dashboard with time range
export async function fetchDashboardStatsWithRange(timeRange: string): Promise<DashboardStats> {
  const { data } = await api.get('/dashboard/stats', { params: { time_range: timeRange } })
  return data
}

export async function fetchDashboardTrendsWithRange(timeframe: string): Promise<{
  hourly: Array<{ hour: string; count: number }>
  daily: Array<{ date: string; critical: number; high: number; medium: number; low: number }>
  timeframe: string
}> {
  const { data } = await api.get('/dashboard/trends', { params: { timeframe } })
  return data
}

export async function fetchDashboardHeatmap(days?: number): Promise<{ heatmap: HeatmapEntry[], days: number }> {
  const { data } = await api.get('/dashboard/heatmap', { params: days ? { days } : {} })
  return data
}

export async function fetchTopIPs(hours?: number): Promise<{ top_ips: TopIP[] }> {
  const { data } = await api.get('/dashboard/top-ips', { params: hours ? { hours } : {} })
  return data
}

// Source details — cached 30 s client-side (matches server GLPI probe cache TTL)
export function fetchSourceDetails(): Promise<{ sources: Record<string, SourceDetail> }> {
  return _cached('source-details', 30 * 1000, () => api.get('/dashboard/source-details').then(r => r.data))
}

// ============== INCIDENTS ==============

export async function fetchIncidents(params?: {
  alert_rule_id?: string
  status?: string
  severity?: string
  assigned_to?: string
  page?: number
  per_page?: number
}): Promise<{ incidents: Incident[]; total: number; pages: number }> {
  const { data } = await api.get('/incidents', { params })
  return data
}

export async function fetchIncident(id: string): Promise<Incident> {
  const { data } = await api.get(`/incidents/${id}`)
  return data
}

export async function updateIncident(
  id: string,
  updates: Partial<Incident>
): Promise<Incident> {
  const { data } = await api.patch(`/incidents/${id}`, updates)
  return data
}

// ============== PLAYBOOKS ==============

export async function fetchPlaybooks(params?: {
  status?: string
  category?: string
}): Promise<{ playbooks: Playbook[]; total: number }> {
  const { data } = await api.get('/playbooks', { params })
  return data
}

export async function fetchPlaybook(id: string): Promise<Playbook> {
  const { data } = await api.get(`/playbooks/${id}`)
  return data
}

export async function createPlaybook(
  playbook: Omit<Playbook, 'id' | 'createdAt' | 'lastRun' | 'triggeredCount' | 'avgDuration' | 'status'>
): Promise<Playbook> {
  const { data } = await api.post('/playbooks', playbook)
  return data
}

export async function updatePlaybook(
  id: string,
  updates: Partial<Playbook>
): Promise<Playbook> {
  const { data } = await api.patch(`/playbooks/${id}`, updates)
  return data
}

export async function deletePlaybook(id: string): Promise<void> {
  await api.delete(`/playbooks/${id}`)
}

export async function duplicatePlaybook(id: string): Promise<Playbook> {
  const { data } = await api.post(`/playbooks/${id}/duplicate`)
  return data
}

export async function togglePlaybook(id: string): Promise<Playbook> {
  const { data } = await api.post(`/playbooks/${id}/toggle`)
  return data
}

export async function archivePlaybook(id: string): Promise<Playbook> {
  const { data } = await api.post(`/playbooks/${id}/archive`)
  return data
}

// ============== PLAYBOOK EXECUTIONS ==============

export async function executePlaybook(
  playbookId: string,
  params?: { alertId?: string; eventId?: string; startedBy?: string }
): Promise<PlaybookExecution> {
  const { data } = await api.post(`/playbooks/${playbookId}/execute`, params)
  return data
}

export async function fetchExecutions(params?: {
  status?: string
  playbook_id?: string
  active?: string
}): Promise<{ executions: PlaybookExecution[]; total: number }> {
  const { data } = await api.get('/playbook-executions', { params })
  return data
}

export async function fetchExecution(id: string): Promise<PlaybookExecution> {
  const { data } = await api.get(`/playbook-executions/${id}`)
  return data
}

export async function updateExecutionStep(
  executionId: string,
  stepIndex: number,
  update: { status: string; result?: string }
): Promise<PlaybookExecution> {
  const { data } = await api.patch(`/playbook-executions/${executionId}/steps/${stepIndex}`, update)
  return data
}

export async function abortExecution(id: string): Promise<PlaybookExecution> {
  const { data } = await api.post(`/playbook-executions/${id}/abort`)
  return data
}

export async function completeExecution(id: string, result?: string): Promise<PlaybookExecution> {
  const { data } = await api.post(`/playbook-executions/${id}/complete`, { result })
  return data
}

// ============== INCIDENTS (create) ==============

export async function createIncident(payload: {
  title: string
  severity: string
  description?: string
  assigned_to?: string
}): Promise<Incident> {
  const { data } = await api.post('/incidents', payload)
  return data
}

// ============== AI TRIAGE ==============

export async function fetchTriageBrief(incidentId: string): Promise<TriageBrief | null> {
  const { data } = await api.get('/triage-briefs', { params: { incident_id: incidentId } })
  return data  // null when no brief exists yet
}

export async function updateTriageBrief(
  briefId: string,
  payload: { action: 'accept' | 'edit' | 'dismiss'; notes?: string; analyst?: string }
): Promise<TriageBrief> {
  const { data } = await api.patch(`/triage-briefs/${briefId}`, payload)
  return data
}

export async function retriageIncident(incidentId: string): Promise<TriageBrief> {
  const { data } = await api.post(`/incidents/${incidentId}/retriage`)
  return data
}

// ============== AI LOG EXPLAINER ==============

export async function explainEvent(eventId: string): Promise<{ explanation: string }> {
  const { data } = await api.post(`/events/${eventId}/explain`)
  return data
}
