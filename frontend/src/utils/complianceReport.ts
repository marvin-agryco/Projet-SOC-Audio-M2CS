import { SecurityEvent } from '../types'
import { ExportSummary } from '../api'
import html2pdf from 'html2pdf.js'

interface ComplianceContext {
  analyst: string
  role: string
  filters: Record<string, string>
  scope: string
  reportId: string
  generatedAt: Date
}

// Inline SVG icons — render identically across machines (no emoji font issues)
const ICON_SHIELD = `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 2 4 5v6.5c0 4.8 3.4 9.3 8 10.5 4.6-1.2 8-5.7 8-10.5V5l-8-3zm0 2.2 6 2.2v5.1c0 3.8-2.6 7.4-6 8.4-3.4-1-6-4.6-6-8.4V6.4l6-2.2z"/></svg>`
const ICON_LOCK = `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm-3 8V6a3 3 0 1 1 6 0v3H9zm3 4a1.5 1.5 0 0 1 .8 2.8V18a.8.8 0 0 1-1.6 0v-2.2A1.5 1.5 0 0 1 12 13z"/></svg>`

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, sans-serif;
    color: #0f172a;
    background: #fff;
    font-size: 11px;
    line-height: 1.5;
  }
  /* A4 portrait = 210mm × 297mm. Each .page targets the printable area. */
  .page { padding: 32px; page-break-after: always; }
  .page:last-child { page-break-after: auto; }

  /* ── Cover page ─────────────────────────────────────────── */
  .cover {
    background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #1e40af 100%);
    color: white;
    height: 277mm; /* A4 portrait minus default margins */
    padding: 40mm 24mm 18mm 24mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    page-break-after: always;
  }
  .cover-top { display: flex; align-items: center; gap: 18px; }
  .cover-logo {
    width: 56px; height: 56px;
    background: rgba(255,255,255,0.15);
    border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    padding: 12px;
  }
  .cover-logo svg { width: 100%; height: 100%; color: white; }
  .cover-brand { font-size: 12px; letter-spacing: 2px; opacity: 0.7; text-transform: uppercase; }
  .cover-brand-name { font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }

  .cover-title {
    margin-top: 48px;
    font-size: 38px;
    font-weight: 800;
    letter-spacing: -1px;
    line-height: 1.15;
  }
  .cover-subtitle {
    margin-top: 10px;
    font-size: 14px;
    opacity: 0.75;
    font-weight: 400;
  }

  .cover-meta {
    margin-top: 24px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px;
    padding: 20px;
  }
  .meta-item-label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 1px;
    opacity: 0.55;
    margin-bottom: 4px;
  }
  .meta-item-value { font-size: 13px; font-weight: 500; word-break: break-word; }

  .cover-footer {
    border-top: 1px solid rgba(255,255,255,0.15);
    padding-top: 18px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .confidential-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: rgba(220, 38, 38, 0.2);
    border: 1px solid rgba(220, 38, 38, 0.4);
    border-radius: 6px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #fecaca;
  }
  .confidential-badge svg { width: 12px; height: 12px; color: #fecaca; }
  .report-id { font-family: 'Monaco', monospace; font-size: 10px; opacity: 0.7; }

  /* ── Content pages ──────────────────────────────────────── */
  .content-page { padding: 24mm 22mm; }
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 12px;
    border-bottom: 1px solid #e2e8f0;
    margin-bottom: 22px;
  }
  .page-header-title { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
  .page-header-meta { font-size: 10px; color: #94a3b8; font-family: 'Monaco', monospace; }

  .section { margin-bottom: 26px; }
  .section-title {
    font-size: 16px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 14px;
    display: flex; align-items: center; gap: 8px;
  }
  .section-title::before {
    content: '';
    display: block;
    width: 4px; height: 18px;
    background: #1e40af;
    border-radius: 2px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }
  .stat-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 14px;
    text-align: center;
  }
  .stat-card.total { background: linear-gradient(135deg, #eff6ff, #dbeafe); border-color: #93c5fd; }
  .stat-card.critical { background: linear-gradient(135deg, #fef2f2, #fee2e2); border-color: #fca5a5; }
  .stat-card.high { background: linear-gradient(135deg, #fff7ed, #ffedd5); border-color: #fdba74; }
  .stat-card.medium { background: linear-gradient(135deg, #fefce8, #fef9c3); border-color: #fde047; }
  .stat-card.low { background: linear-gradient(135deg, #f0fdf4, #dcfce7); border-color: #86efac; }
  .stat-value { font-size: 28px; font-weight: 700; line-height: 1.1; }
  .stat-card.total .stat-value { color: #1d4ed8; }
  .stat-card.critical .stat-value { color: #dc2626; }
  .stat-card.high .stat-value { color: #ea580c; }
  .stat-card.medium .stat-value { color: #ca8a04; }
  .stat-card.low .stat-value { color: #16a34a; }
  .stat-label {
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px;
    color: #64748b; margin-top: 4px; font-weight: 600;
  }

  /* Breakdown lists */
  .breakdown-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
  }
  .breakdown-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 14px 16px;
  }
  .breakdown-title {
    font-size: 11px;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 10px;
  }
  .breakdown-row {
    display: flex; align-items: center; gap: 10px;
    padding: 6px 0;
    border-bottom: 1px solid #f1f5f9;
    font-size: 11px;
  }
  .breakdown-row:last-child { border-bottom: none; }
  .breakdown-label { flex-shrink: 0; min-width: 90px; color: #334155; text-transform: capitalize; }
  .breakdown-bar-wrap { flex: 1; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
  .breakdown-bar { height: 100%; background: #3b82f6; border-radius: 3px; }
  .breakdown-bar.critical { background: #dc2626; }
  .breakdown-bar.high { background: #ea580c; }
  .breakdown-bar.medium { background: #ca8a04; }
  .breakdown-bar.low { background: #16a34a; }
  .breakdown-count { min-width: 36px; text-align: right; font-weight: 600; color: #0f172a; }

  /* Events table */
  table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 9.5px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
  thead { background: #0f172a; }
  thead, thead tr, thead th { page-break-inside: avoid; break-inside: avoid; }
  th { padding: 10px 8px; text-align: left; color: white; font-weight: 600; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 8px; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: top; }
  tbody tr { page-break-inside: avoid; break-inside: avoid; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  tbody tr:last-child td { border-bottom: none; }

  .badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; color: white; }
  .badge-critical { background: #dc2626; }
  .badge-high { background: #ea580c; }
  .badge-medium { background: #ca8a04; }
  .badge-low { background: #16a34a; }
  .status { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 8px; font-weight: 500; text-transform: capitalize; }
  .status-new { background: #dbeafe; color: #1d4ed8; }
  .status-investigating { background: #fef3c7; color: #b45309; }
  .status-resolved { background: #dcfce7; color: #15803d; }
  .status-false_positive { background: #f1f5f9; color: #64748b; }

  .mono { font-family: 'Monaco', monospace; font-size: 10px; color: #475569; }

  /* Sign-off */
  .signoff-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 30px;
    margin-top: 30px;
  }
  .signoff-block {
    border-top: 1px solid #94a3b8;
    padding-top: 8px;
    font-size: 10px;
  }
  .signoff-label { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 24px; }
  .signoff-name { font-weight: 600; color: #0f172a; }

  /* Audit footer */
  .audit-footer {
    margin-top: 40px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 14px 16px;
    font-size: 9.5px;
    color: #475569;
  }
  .audit-footer .row { display: flex; justify-content: space-between; padding: 2px 0; }
  .audit-footer .label { color: #64748b; }
  .audit-footer .value { font-family: 'Monaco', monospace; }
  .audit-hash { word-break: break-all; }
`

function fmt(date: string | null | Date | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('fr-FR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function renderBreakdownRow(label: string, count: number, total: number, severityClass = ''): string {
  const pct = total > 0 ? (count / total) * 100 : 0
  return `
    <div class="breakdown-row">
      <span class="breakdown-label">${label}</span>
      <div class="breakdown-bar-wrap"><div class="breakdown-bar ${severityClass}" style="width: ${pct}%"></div></div>
      <span class="breakdown-count">${count}</span>
    </div>
  `
}

function renderCover(summary: ExportSummary, ctx: ComplianceContext, eventCount: number): string {
  const filterEntries = Object.entries(ctx.filters)
    .filter(([k, v]) => v && !['format', 'max_rows'].includes(k))
  const filtersText = filterEntries.length === 0
    ? 'None (full dataset within scope)'
    : filterEntries.map(([k, v]) => `${k} = ${v}`).join(' · ')

  return `
    <div class="cover">
      <div>
        <div class="cover-top">
          <div class="cover-logo">${ICON_SHIELD}</div>
          <div>
            <div class="cover-brand">AudioSOC</div>
            <div class="cover-brand-name">Security Operations Center</div>
          </div>
        </div>

        <div class="cover-title">Security Events<br/>Compliance Report</div>
        <div class="cover-subtitle">AudioPro Network — ${eventCount} event${eventCount === 1 ? '' : 's'} included</div>

        <div class="cover-meta">
          <div>
            <div class="meta-item-label">Report ID</div>
            <div class="meta-item-value" style="font-family: Monaco, monospace;">${ctx.reportId}</div>
          </div>
          <div>
            <div class="meta-item-label">Generated</div>
            <div class="meta-item-value">${fmt(ctx.generatedAt)}</div>
          </div>
          <div>
            <div class="meta-item-label">Prepared By</div>
            <div class="meta-item-value">${ctx.analyst} <span style="opacity: 0.6">(${ctx.role})</span></div>
          </div>
          <div>
            <div class="meta-item-label">Scope</div>
            <div class="meta-item-value">${ctx.scope}</div>
          </div>
          <div style="grid-column: 1 / -1;">
            <div class="meta-item-label">Time Range</div>
            <div class="meta-item-value">${fmt(summary.first_event)} → ${fmt(summary.last_event)}</div>
          </div>
          <div style="grid-column: 1 / -1;">
            <div class="meta-item-label">Filters Applied</div>
            <div class="meta-item-value">${filtersText}</div>
          </div>
        </div>
      </div>

      <div class="cover-footer">
        <div class="confidential-badge">${ICON_LOCK}<span>Confidential — Internal Use Only</span></div>
        <div class="report-id">AudioSOC v1.10 · ANSSI-aligned</div>
      </div>
    </div>
  `
}

function renderSummaryPage(summary: ExportSummary, ctx: ComplianceContext): string {
  const total = summary.total
  const sevBreakdown = (['critical', 'high', 'medium', 'low'] as const)
    .map(s => renderBreakdownRow(s, summary.by_severity[s] || 0, total, s))
    .join('')
  const statusBreakdown = (['new', 'investigating', 'resolved', 'false_positive'] as const)
    .map(s => renderBreakdownRow(s.replace('_', ' '), summary.by_status[s] || 0, total))
    .join('')
  const sourceBreakdown = Object.entries(summary.by_source)
    .sort((a, b) => b[1] - a[1])
    .map(([s, c]) => renderBreakdownRow(s, c, total))
    .join('')

  return `
    <div class="page content-page">
      <div class="page-header">
        <div class="page-header-title">Executive Summary</div>
        <div class="page-header-meta">${ctx.reportId} · Page 2</div>
      </div>

      <div class="section">
        <div class="section-title">Key Metrics</div>
        <div class="stats-grid">
          <div class="stat-card total"><div class="stat-value">${summary.total}</div><div class="stat-label">Total</div></div>
          <div class="stat-card critical"><div class="stat-value">${summary.by_severity.critical || 0}</div><div class="stat-label">Critical</div></div>
          <div class="stat-card high"><div class="stat-value">${summary.by_severity.high || 0}</div><div class="stat-label">High</div></div>
          <div class="stat-card medium"><div class="stat-value">${summary.by_severity.medium || 0}</div><div class="stat-label">Medium</div></div>
          <div class="stat-card low"><div class="stat-value">${summary.by_severity.low || 0}</div><div class="stat-label">Low</div></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Breakdowns</div>
        <div class="breakdown-grid">
          <div class="breakdown-card">
            <div class="breakdown-title">By Severity</div>
            ${sevBreakdown}
          </div>
          <div class="breakdown-card">
            <div class="breakdown-title">By Status</div>
            ${statusBreakdown}
          </div>
          <div class="breakdown-card" style="grid-column: 1 / -1;">
            <div class="breakdown-title">By Source</div>
            ${sourceBreakdown || '<div style="font-size: 10px; color: #94a3b8;">No data</div>'}
          </div>
        </div>
      </div>
    </div>
  `
}

function renderEventsTable(events: SecurityEvent[], ctx: ComplianceContext): string {
  if (events.length === 0) {
    return `
      <div class="page content-page">
        <div class="page-header">
          <div class="page-header-title">Event Log</div>
          <div class="page-header-meta">${ctx.reportId}</div>
        </div>
        <div style="padding: 40px; text-align: center; color: #94a3b8;">No events match the selected scope.</div>
      </div>
    `
  }

  const rows = events.map(e => `
    <tr>
      <td class="mono">${fmt(e.timestamp)}</td>
      <td><span class="badge badge-${e.severity}">${e.severity}</span></td>
      <td>${e.source}</td>
      <td>${(e.description || '').slice(0, 180)}</td>
      <td><span class="status status-${e.status}">${e.status.replace('_', ' ')}</span></td>
      <td class="mono">${e.site_id || '—'}</td>
    </tr>
  `).join('')

  return `
    <div class="page content-page">
      <div class="page-header">
        <div class="page-header-title">Event Log — ${events.length} entries</div>
        <div class="page-header-meta">${ctx.reportId}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 130px;">Timestamp</th>
            <th style="width: 60px;">Severity</th>
            <th style="width: 70px;">Source</th>
            <th>Description</th>
            <th style="width: 80px;">Status</th>
            <th style="width: 110px;">Site</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

function renderSignoff(ctx: ComplianceContext, hash: string): string {
  return `
    <div class="page content-page">
      <div class="page-header">
        <div class="page-header-title">Sign-off & Integrity</div>
        <div class="page-header-meta">${ctx.reportId}</div>
      </div>

      <div class="section">
        <div class="section-title">Statement of Authenticity</div>
        <p style="font-size: 11px; color: #334155; line-height: 1.7;">
          This report was generated automatically from the AudioSOC platform on
          <strong>${fmt(ctx.generatedAt)}</strong> by <strong>${ctx.analyst}</strong>
          (${ctx.role}). The data reflects security events recorded in the SOC
          database matching the filters listed on the cover page.
          The SHA-256 hash below covers the dataset payload and allows independent
          verification of report integrity.
        </p>
      </div>

      <div class="signoff-grid">
        <div class="signoff-block">
          <div class="signoff-label">Prepared by</div>
          <div class="signoff-name">${ctx.analyst}</div>
          <div style="color: #64748b; font-size: 9px;">${ctx.role} — AudioSOC</div>
        </div>
        <div class="signoff-block">
          <div class="signoff-label">Reviewed by</div>
          <div style="color: #94a3b8; font-style: italic;">(pending)</div>
        </div>
      </div>

      <div class="audit-footer">
        <div class="row"><span class="label">Report ID</span><span class="value">${ctx.reportId}</span></div>
        <div class="row"><span class="label">Generated</span><span class="value">${ctx.generatedAt.toISOString()}</span></div>
        <div class="row"><span class="label">Tool</span><span class="value">AudioSOC v1.10 — compliance export</span></div>
        <div class="row"><span class="label">SHA-256 (dataset)</span><span class="value audit-hash">${hash}</span></div>
      </div>
    </div>
  `
}

export async function exportComplianceReport(
  events: SecurityEvent[],
  summary: ExportSummary,
  ctx: ComplianceContext,
): Promise<void> {
  const datasetHash = await sha256(JSON.stringify(events.map(e => ({
    id: e.id, ts: e.timestamp, sev: e.severity, src: e.source,
    type: e.event_type, desc: e.description, status: e.status,
  }))))

  const container = document.createElement('div')
  container.innerHTML = `
    <!DOCTYPE html>
    <html><head><style>${styles}</style></head><body>
      ${renderCover(summary, ctx, events.length)}
      ${renderSummaryPage(summary, ctx)}
      ${renderEventsTable(events, ctx)}
      ${renderSignoff(ctx, datasetHash)}
    </body></html>
  `
  document.body.appendChild(container)

  const filename = `audiosoc-compliance-${ctx.reportId}.pdf`
  const options = {
    margin: 0,
    filename,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true, logging: false },
    jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
    pagebreak: { mode: ['css', 'legacy'] as const, avoid: ['tr', 'thead'] },
  }

  try {
    await html2pdf().set(options).from(container).save()
  } catch (err) {
    console.error('Compliance PDF generation failed:', err)
    alert('Failed to generate compliance PDF.')
  } finally {
    document.body.removeChild(container)
  }
}
