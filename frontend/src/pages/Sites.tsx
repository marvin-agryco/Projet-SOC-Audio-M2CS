import { useEffect, useState, useMemo } from 'react'
import { Search, Shield, Wifi, WifiOff, Monitor, Laptop, Terminal, Activity, Clock } from 'lucide-react'
import clsx from 'clsx'
import { fetchAssets, fetchSitesSummary, fetchSourceDetails, fetchEndpoints } from '../api'
import { GLPIAsset, SiteSummary, SourceDetail, EnrichedAsset, Endpoint } from '../types'
import { useSocket } from '../hooks/useSocket'
import AssetDetailPanel from '../components/AssetDetailPanel'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse the GLPI comment field.
 * Format set by populate_glpi.py: "{center_name} | {site_id} | {Windows|macOS}"
 */
function parseGLPIComment(comment: string | null) {
  if (!comment) return { centerName: '', siteId: '', osStr: '' }
  const parts = comment.split(' | ')
  return {
    centerName: parts[0]?.trim() ?? '',
    siteId:     parts[1]?.trim() ?? '',
    osStr:      parts[2]?.trim() ?? '',
  }
}

function parseOS(comment: string | null): { label: string; platform: 'windows' | 'macos' | 'linux' } {
  const { osStr } = parseGLPIComment(comment)
  if (osStr.includes('macOS'))   return { label: 'macOS Sonoma',   platform: 'macos' }
  if (osStr.includes('Windows')) return { label: 'Windows 11 Pro', platform: 'windows' }
  return                                { label: 'Linux',           platform: 'linux' }
}

/** Strip "Centre Audio " prefix to get a concise center label. */
function shortCenter(full: string): string {
  return full.replace(/^Centre Audio /, '').trim() || full
}

function enrichAssets(assets: GLPIAsset[], siteMap: Map<string, SiteSummary>): EnrichedAsset[] {
  return assets.map(asset => {
    const { label: os, platform: osPlatform } = parseOS(asset.comment)
    const { siteId: parsedSiteId, centerName } = parseGLPIComment(asset.comment)

    const siteId = parsedSiteId || (() => {
      const m = asset.name.match(/^PC-(.+)-\d+$/)
      return m ? 'AUDIO_' + m[1].replace(/-/g, '_') : ''
    })()

    const site           = siteMap.get(siteId)
    const criticalAlerts = site?.critical ?? 0
    const highAlerts     = site?.high     ?? 0
    const medAlerts      = site?.medium   ?? 0
    const vulnScore      = Math.min(100, criticalAlerts * 20 + highAlerts * 8 + medAlerts * 2)
    const status         = criticalAlerts > 0 ? 'offline' : highAlerts > 0 ? 'degraded' : 'online'

    const dept = typeof asset.locations_id === 'string' && asset.locations_id
      ? shortCenter(asset.locations_id)
      : centerName
        ? shortCenter(centerName)
        : siteId.replace('AUDIO_', '').replace(/_/g, ' ')

    return {
      ...asset,
      os, osPlatform, siteId,
      ip: '',
      dept, vulnScore, status, criticalAlerts, highAlerts,
    } as EnrichedAsset
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const color = status === 'online' ? 'bg-green-500' : status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <span className="flex items-center justify-center">
      <span className={clsx('w-2 h-2 rounded-full', color)} />
    </span>
  )
}

function OSBadge({ platform, label }: { platform: string; label: string }) {
  if (platform === 'windows') return (
    <span title={label} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/15 text-blue-400 border border-blue-500/20 rounded text-xs font-medium">
      <Monitor className="w-3 h-3" /> Win
    </span>
  )
  if (platform === 'macos') return (
    <span title={label} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-600/30 text-slate-300 border border-slate-600/30 rounded text-xs font-medium">
      <Laptop className="w-3 h-3" /> Mac
    </span>
  )
  return (
    <span title={label} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-orange-500/15 text-orange-400 border border-orange-500/20 rounded text-xs font-medium">
      <Terminal className="w-3 h-3" /> Linux
    </span>
  )
}

function VulnBadge({ score }: { score: number }) {
  const cls = score <= 25  ? 'bg-green-500/20 text-green-400 border-green-500/30' :
              score <= 50  ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' :
              score <= 75  ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' :
                             'bg-red-500/20 text-red-300 border-red-500/30'
  return <span className={clsx('px-2 py-0.5 rounded border text-sm font-bold tabular-nums', cls)}>{score}</span>
}

/** Severity pill: e.g. SevPill({ count: 3, label: 'C', cls: 'text-red-400 bg-red-500/15 border-red-500/25' }) */
function SevPill({ count, label, cls }: { count: number; label: string; cls: string }) {
  if (count === 0) return <span className="text-slate-600 tabular-nums">—</span>
  return (
    <span className={clsx('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-xs font-bold tabular-nums', cls)}>
      {count}<span className="opacity-70 font-normal">{label}</span>
    </span>
  )
}

function isSourceActive(s: SourceDetail) {
  // Keepalive within 10 min → definitely active
  if (s.last_keepalive_at) {
    const age = Date.now() - new Date(s.last_keepalive_at).getTime()
    if (age < 10 * 60 * 1000) return true
  }
  // Fallback: recent security events mean the source is alive
  return s.events_24h > 0
}

function InfraBar({ sources, connected }: { sources: Record<string, SourceDetail>; connected: boolean }) {
  const items = [
    { key: 'wazuh',    label: 'Wazuh Manager', active: connected },
    { key: 'firewall', label: 'Firewall',       active: sources.firewall    ? isSourceActive(sources.firewall)    : false },
    { key: 'ids',      label: 'IDS / Suricata', active: sources.ids         ? isSourceActive(sources.ids)         : false },
    { key: 'glpi',     label: 'GLPI API',       active: sources.application ? isSourceActive(sources.application) : false },
  ]
  return (
    <div className="flex gap-3 flex-wrap">
      {items.map(item => (
        <div key={item.key} className={clsx(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium',
          item.active ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
        )}>
          {item.active ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          <span className="text-slate-400">{item.label}:</span>
          <span className="font-bold">{item.active ? 'Online' : 'Offline'}</span>
        </div>
      ))}
    </div>
  )
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const STATUS_FILTERS = ['all', 'online', 'degraded', 'offline'] as const
const OS_FILTERS = [['all', 'All OS'], ['windows', 'Windows'], ['macos', 'macOS']] as const

export default function Sites() {
  const { connected } = useSocket()

  const [assets,           setAssets]           = useState<GLPIAsset[]>([])
  const [siteMap,          setSiteMap]          = useState<Map<string, SiteSummary>>(new Map())
  const [sources,          setSources]          = useState<Record<string, SourceDetail>>({})
  const [endpoints,        setEndpoints]        = useState<Endpoint[]>([])
  const [endpointsLoading, setEndpointsLoading] = useState(true)
  const [assetsLoading,    setAssetsLoading]    = useState(true)

  const [search,  setSearch]  = useState('')
  const [statusF, setStatusF] = useState('all')
  const [osF,     setOsF]     = useState('all')

  const [selected,  setSelected]  = useState<EnrichedAsset | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  useEffect(() => {
    // Chain 1: fast DB-only calls — Section 1 (Monitored Sites) loads first
    Promise.all([fetchSitesSummary(), fetchSourceDetails(), fetchEndpoints()])
      .then(([sitesData, sourcesData, endpointsData]) => {
        const m = new Map<string, SiteSummary>()
        for (const s of sitesData.sites) m.set(s.site_id, s)
        setSiteMap(m)
        setSources(sourcesData.sources)
        setEndpoints(endpointsData.endpoints)
      })
      .catch(console.error)
      .finally(() => setEndpointsLoading(false))

    // Chain 2: GLPI call — Section 2 (Asset Inventory) loads independently
    // Client cache makes this instant on second+ visit (no spinner)
    fetchAssets()
      .then(data => setAssets(data.assets))
      .catch(console.error)
      .finally(() => setAssetsLoading(false))
  }, [])

  const enriched = useMemo(() => enrichAssets(assets, siteMap), [assets, siteMap])

  const filtered = useMemo(() => enriched.filter(a => {
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) &&
        !a.dept.toLowerCase().includes(search.toLowerCase())) return false
    if (statusF !== 'all' && a.status !== statusF) return false
    if (osF     !== 'all' && a.osPlatform !== osF)  return false
    return true
  }), [enriched, search, statusF, osF])

  const onlineCount  = enriched.filter(a => a.status === 'online').length
  const offlineCount = enriched.filter(a => a.status === 'offline').length
  const critCount    = enriched.filter(a => a.vulnScore >= 75).length
  const epOnline     = endpoints.filter(e => e.status === 'online').length
  const epOffline    = endpoints.filter(e => e.status === 'offline').length

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Infrastructure & Asset Management</h1>
          <p className="text-sm text-slate-400 mt-1">
            {endpoints.length} monitored sites &middot; {enriched.length} GLPI assets &middot; {onlineCount} online &middot; {offlineCount} offline
            {critCount > 0 && <span className="text-red-400"> &middot; {critCount} critical</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 text-slate-500">
          <Shield className="w-5 h-5 text-blue-500" />
          <span className="text-sm">Asset Intelligence</span>
        </div>
      </div>

      {/* Infrastructure pulse bar */}
      <InfraBar sources={sources} connected={connected} />

      {/* ── Section 1: Monitored Sites ────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Monitored Sites</h2>
          <span className="text-xs text-slate-500 ml-1">
            {epOnline} online · {epOffline} offline · Wazuh / event pipeline
          </span>
        </div>

        {endpointsLoading ? (
          <div className="glass-card p-6 flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500" />
          </div>
        ) : endpoints.length === 0 ? (
          <div className="glass-card p-4 text-center text-slate-500 text-sm">No monitored sites detected</div>
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-800/80">
                <tr className="border-b border-slate-700 text-left">
                  <th className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider w-16">Status</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Site</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider w-28 text-right">Events 24h</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider w-20 text-center">Critical</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider w-20 text-center">High</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider w-20 text-center">Medium</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider w-20 text-center">Low</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider w-28">Last Event</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map(ep => (
                  <tr key={ep.id} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <StatusDot status={ep.status} />
                        <span className={clsx('text-xs font-medium capitalize',
                          ep.status === 'online'   ? 'text-green-400' :
                          ep.status === 'degraded' ? 'text-yellow-400' : 'text-red-400'
                        )}>{ep.status}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-sm text-blue-400 font-medium">
                        {ep.site_id || ep.name}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-sm text-slate-200 font-medium tabular-nums">
                        {ep.event_count_24h.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <SevPill count={ep.critical_open ?? 0} label=" C" cls="text-red-400 bg-red-500/15 border-red-500/25" />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <SevPill count={ep.high_open ?? 0} label=" H" cls="text-orange-400 bg-orange-500/15 border-orange-500/25" />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <SevPill count={ep.medium_open ?? 0} label=" M" cls="text-yellow-400 bg-yellow-500/15 border-yellow-500/25" />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <SevPill count={ep.low_open ?? 0} label=" L" cls="text-blue-400 bg-blue-500/15 border-blue-500/25" />
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1 text-sm text-slate-400">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        {relativeTime(ep.last_seen)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 2: GLPI Asset Inventory ──────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-green-400" />
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">GLPI Asset Inventory</h2>
          <span className="text-xs px-1.5 py-0.5 bg-green-500/15 text-green-400 border border-green-500/20 rounded font-medium ml-1">
            {enriched.length} assets
          </span>
        </div>

        {/* Search + Filters */}
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search hostname or center..."
              className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div className="flex bg-slate-800 border border-slate-700 rounded-lg overflow-hidden text-xs">
            {STATUS_FILTERS.map(f => (
              <button key={f} onClick={() => setStatusF(f)}
                className={clsx('px-3 py-2 capitalize transition-colors',
                  statusF === f ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                )}>
                {f === 'all' ? 'All Status' : f}
              </button>
            ))}
          </div>

          <div className="flex bg-slate-800 border border-slate-700 rounded-lg overflow-hidden text-xs">
            {OS_FILTERS.map(([f, label]) => (
              <button key={f} onClick={() => setOsF(f)}
                className={clsx('px-3 py-2 transition-colors',
                  osF === f ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                )}>
                {label}
              </button>
            ))}
          </div>

          <span className="text-sm text-slate-500 ml-auto">{filtered.length} results</span>
        </div>

        {assetsLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 520px)' }}>
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-800/95 backdrop-blur-sm z-10">
                  <tr className="border-b border-slate-700 text-left">
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider w-20">Status</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider w-16">OS</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Hostname</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Center</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider w-32">State</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider w-20">Vuln.</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-slate-500 text-sm">No assets match your filters</td>
                    </tr>
                  ) : (
                    filtered.map(asset => (
                      <tr
                        key={asset.id}
                        onClick={() => { setSelected(asset); setPanelOpen(true) }}
                        className={clsx(
                          'border-b border-slate-700/30 hover:bg-slate-700/25 cursor-pointer transition-colors',
                          selected?.id === asset.id && panelOpen && 'bg-slate-700/35 border-l-2 border-l-blue-500'
                        )}
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <StatusDot status={asset.status} />
                            <span className={clsx('text-xs font-medium capitalize',
                              asset.status === 'online'   ? 'text-green-400' :
                              asset.status === 'degraded' ? 'text-yellow-400' : 'text-red-400'
                            )}>{asset.status}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2"><OSBadge platform={asset.osPlatform} label={asset.os} /></td>
                        <td className="px-3 py-2 font-mono text-sm text-blue-400 font-medium">{asset.name}</td>
                        <td className="px-3 py-2 text-sm text-slate-300 truncate max-w-[200px]">{asset.dept}</td>
                        <td className="px-3 py-2 text-sm text-slate-400">
                          {typeof asset.states_id === 'string' ? asset.states_id : '—'}
                        </td>
                        <td className="px-3 py-2"><VulnBadge score={asset.vulnScore} /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <AssetDetailPanel
        asset={selected}
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
      />
    </div>
  )
}
