import { useEffect, useState } from 'react'
import { X, FileText, FileSpreadsheet, FileJson, ShieldCheck, Loader2, AlertCircle } from 'lucide-react'
import clsx from 'clsx'
import {
  ExportFilters,
  ExportSummary,
  buildExportCsvUrl,
  fetchEventsExport,
  fetchExportSummary,
} from '../api'
import { SecurityEvent } from '../types'
import { exportEventsToCSV, exportEventsReport, exportToJSON } from '../utils/export'
import { exportComplianceReport } from '../utils/complianceReport'
import DateRangePicker from './DateRangePicker'
import { useLanguage } from '../context/LanguageContext'

type Scope = 'page' | 'all' | 'range'
type Format = 'csv' | 'pdf-compliance' | 'pdf-quick' | 'json'

interface Props {
  open: boolean
  onClose: () => void
  /** Events currently visible on the page (used for scope='page') */
  pageEvents: SecurityEvent[]
  /** Active filters from the Events page — sent to backend for scope='all' */
  currentFilters: ExportFilters
  /** Analyst info for cover page */
  analyst: string
  role: string
}

function generateReportId(): string {
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `RPT-${stamp}-${rand}`
}

export default function ExportDialog({
  open,
  onClose,
  pageEvents,
  currentFilters,
  analyst,
  role,
}: Props) {
  const { locale } = useLanguage()
  const [scope, setScope] = useState<Scope>('page')
  const [format, setFormat] = useState<Format>('csv')
  const [rangeStart, setRangeStart] = useState<Date>(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d
  })
  const [rangeEnd, setRangeEnd] = useState<Date>(() => new Date())
  const [summary, setSummary] = useState<ExportSummary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function buildFilters(): ExportFilters {
    const base = { ...currentFilters }
    if (scope === 'range') {
      base.start = rangeStart.toISOString()
      base.end = rangeEnd.toISOString()
    }
    return base
  }

  // Fetch summary whenever scope or range changes (only for backend-based scopes)
  useEffect(() => {
    if (!open || scope === 'page') {
      setSummary(null)
      return
    }
    let cancelled = false
    setLoadingSummary(true)
    setError(null)
    fetchExportSummary(buildFilters())
      .then(s => { if (!cancelled) setSummary(s) })
      .catch(err => {
        if (!cancelled) setError(err?.response?.data?.error || 'Failed to load summary')
      })
      .finally(() => { if (!cancelled) setLoadingSummary(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope, rangeStart, rangeEnd])

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setBusy(false)
      setError(null)
    }
  }, [open])

  const estimatedCount = scope === 'page' ? pageEvents.length : (summary?.total ?? null)

  async function handleExport() {
    setBusy(true)
    setError(null)
    try {
      if (scope === 'page') {
        await runExport(pageEvents, null)
      } else {
        if (format === 'csv') {
          // Stream from backend directly
          const url = buildExportCsvUrl(buildFilters())
          window.location.assign(url)
          onClose()
          return
        }
        // For PDF/JSON we need the events in memory
        const events = await fetchEventsExport(buildFilters())
        const summaryData = summary ?? await fetchExportSummary(buildFilters())
        await runExport(events, summaryData)
      }
      onClose()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }, message?: string }
      setError(e?.response?.data?.error || e?.message || 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  async function runExport(events: SecurityEvent[], summaryData: ExportSummary | null) {
    const stamp = new Date().toISOString().split('T')[0]
    if (format === 'csv') {
      exportEventsToCSV(events, `security-events-${stamp}`)
    } else if (format === 'json') {
      exportToJSON(events, `security-events-${stamp}`)
    } else if (format === 'pdf-quick') {
      const stats = {
        total: events.length,
        critical: events.filter(e => e.severity === 'critical').length,
        high: events.filter(e => e.severity === 'high').length,
        medium: events.filter(e => e.severity === 'medium').length,
        low: events.filter(e => e.severity === 'low').length,
      }
      exportEventsReport(events, stats, locale())
    } else if (format === 'pdf-compliance') {
      const effectiveSummary: ExportSummary = summaryData ?? {
        total: events.length,
        by_severity: {
          critical: events.filter(e => e.severity === 'critical').length,
          high: events.filter(e => e.severity === 'high').length,
          medium: events.filter(e => e.severity === 'medium').length,
          low: events.filter(e => e.severity === 'low').length,
        },
        by_status: events.reduce((acc, e) => { acc[e.status] = (acc[e.status] || 0) + 1; return acc }, {} as Record<string, number>),
        by_source: events.reduce((acc, e) => { acc[e.source] = (acc[e.source] || 0) + 1; return acc }, {} as Record<string, number>),
        first_event: events.length ? events[events.length - 1].timestamp : null,
        last_event: events.length ? events[0].timestamp : null,
        generated_at: new Date().toISOString(),
        filters: Object.entries(currentFilters).reduce((acc, [k, v]) => {
          if (v) acc[k] = String(v)
          return acc
        }, {} as Record<string, string>),
      }
      const scopeLabel = scope === 'page' ? 'Current page (visible events)'
        : scope === 'all' ? 'All filtered events'
        : `Date range ${rangeStart.toISOString()} → ${rangeEnd.toISOString()}`
      await exportComplianceReport(events, effectiveSummary, {
        analyst,
        role,
        filters: effectiveSummary.filters,
        scope: scopeLabel,
        reportId: generateReportId(),
        generatedAt: new Date(),
        locale: locale(),
      })
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className={clsx('relative w-full rounded-xl shadow-2xl transition-all', scope === 'range' ? 'max-w-4xl' : 'max-w-2xl')}
        style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>Export Events</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Configure scope and format for the export
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/5" style={{ color: 'var(--color-text-muted)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Scope */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>
              Scope
            </label>
            <div className="grid grid-cols-3 gap-2">
              <ScopeOption value="page" current={scope} onChange={setScope} title="Current page" subtitle={`${pageEvents.length} visible`} />
              <ScopeOption value="all" current={scope} onChange={setScope} title="All filtered" subtitle="Every match" />
              <ScopeOption value="range" current={scope} onChange={setScope} title="Date range" subtitle="Pick start/end" />
            </div>

            {scope === 'range' && (
              <div className="mt-3">
                <DateRangePicker
                  start={rangeStart}
                  end={rangeEnd}
                  onChange={(s, e) => { setRangeStart(s); setRangeEnd(e) }}
                />
              </div>
            )}
          </div>

          {/* Estimated count */}
          {scope !== 'page' && (
            <div className="px-4 py-3 rounded-lg text-sm flex items-center gap-3" style={{ backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}>
              {loadingSummary ? (
                <><Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
                  <span style={{ color: 'var(--color-text-muted)' }}>Counting matching events…</span></>
              ) : summary ? (
                <>
                  <span className="font-semibold text-blue-400">{summary.total.toLocaleString()}</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    event{summary.total === 1 ? '' : 's'} match. Critical: {summary.by_severity.critical || 0} ·
                    High: {summary.by_severity.high || 0} · Medium: {summary.by_severity.medium || 0} ·
                    Low: {summary.by_severity.low || 0}
                  </span>
                </>
              ) : null}
            </div>
          )}

          {/* Format */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>
              Format
            </label>
            <div className="grid grid-cols-2 gap-2">
              <FormatOption
                value="csv" current={format} onChange={setFormat}
                icon={FileSpreadsheet} iconColor="text-green-400"
                title="CSV" subtitle="Spreadsheet / SIEM ingestion"
              />
              <FormatOption
                value="json" current={format} onChange={setFormat}
                icon={FileJson} iconColor="text-blue-400"
                title="JSON" subtitle="Full event payload"
              />
              <FormatOption
                value="pdf-quick" current={format} onChange={setFormat}
                icon={FileText} iconColor="text-orange-400"
                title="PDF (quick)" subtitle="Simple report"
              />
              <FormatOption
                value="pdf-compliance" current={format} onChange={setFormat}
                icon={ShieldCheck} iconColor="text-purple-400"
                title="PDF (compliance)" subtitle="Cover, summary, SHA-256"
                badge="Audit-ready"
              />
            </div>
          </div>

          {/* Warning for large compliance/JSON exports */}
          {scope !== 'page' && format !== 'csv' && estimatedCount !== null && estimatedCount > 5000 && (
            <div className="px-4 py-3 rounded-lg text-sm flex items-start gap-2" style={{ backgroundColor: 'rgba(202, 138, 4, 0.1)', border: '1px solid rgba(202, 138, 4, 0.3)', color: '#fde047' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                {estimatedCount.toLocaleString()} events will be rendered client-side. PDF generation may take 30s+ and use significant memory. CSV is recommended for datasets this size.
              </span>
            </div>
          )}

          {error && (
            <div className="px-4 py-3 rounded-lg text-sm flex items-center gap-2" style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(220, 38, 38, 0.3)', color: '#fca5a5' }}>
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-end gap-2" style={{ borderTop: '1px solid var(--color-border)' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm hover:bg-white/5"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={busy || (scope !== 'page' && loadingSummary) || (scope !== 'page' && summary?.total === 0)}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {busy ? (<><Loader2 className="w-4 h-4 animate-spin" /> Exporting…</>) : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ScopeOption({
  value, current, onChange, title, subtitle,
}: {
  value: Scope; current: Scope; onChange: (s: Scope) => void;
  title: string; subtitle: string;
}) {
  const active = value === current
  return (
    <button
      onClick={() => onChange(value)}
      className={clsx(
        'px-3 py-3 rounded-lg text-left transition-all',
        active ? 'ring-2 ring-blue-500' : 'hover:bg-white/5'
      )}
      style={{
        backgroundColor: active ? 'rgba(59, 130, 246, 0.1)' : 'var(--color-bg-tertiary)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{title}</div>
      <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</div>
    </button>
  )
}

function FormatOption({
  value, current, onChange, icon: Icon, iconColor, title, subtitle, badge,
}: {
  value: Format; current: Format; onChange: (f: Format) => void;
  icon: typeof FileText; iconColor: string;
  title: string; subtitle: string; badge?: string;
}) {
  const active = value === current
  return (
    <button
      onClick={() => onChange(value)}
      className={clsx(
        'px-3 py-3 rounded-lg text-left transition-all flex items-start gap-3 relative',
        active ? 'ring-2 ring-blue-500' : 'hover:bg-white/5'
      )}
      style={{
        backgroundColor: active ? 'rgba(59, 130, 246, 0.1)' : 'var(--color-bg-tertiary)',
        border: '1px solid var(--color-border)',
      }}
    >
      <Icon className={clsx('w-5 h-5 flex-shrink-0 mt-0.5', iconColor)} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
          {title}
          {badge && <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-semibold uppercase tracking-wider">{badge}</span>}
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</div>
      </div>
    </button>
  )
}
