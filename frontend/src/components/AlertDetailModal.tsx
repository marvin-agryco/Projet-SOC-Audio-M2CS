import { useState, useEffect } from 'react'
import {
  Clock,
  MapPin,
  Server,
  User,
  FileText,
  Activity,
  CheckCircle,
  AlertTriangle,
  ArrowUpCircle,
  MessageSquare,
  Send,
  Check,
  PlayCircle,
  Sparkles,
  Download,
} from 'lucide-react'
import clsx from 'clsx'
import Modal from './Modal'
import LoadingSpinner from './LoadingSpinner'
import { toast } from './Toast'
import { SecurityEvent, Severity, EventStatus, AlertComment, Analyst, TimelineEvent, Playbook } from '../types'
import { fetchEvent, updateEventStatus, fetchEventComments, addEventComment, fetchAnalysts, fetchPlaybooks, executePlaybook } from '../api'
import { exportIncidentReport } from '../utils/export'
import { useRole } from '../context/RoleContext'
import { useLanguage } from '../context/LanguageContext'
import { useNotification } from '../context/NotificationContext'

interface AlertDetailModalProps {
  eventId: string | null
  isOpen: boolean
  onClose: () => void
  onUpdate?: (event: SecurityEvent) => void
}

type TabId = 'overview' | 'timeline' | 'rawdata' | 'actions'

const tabs: Array<{ id: TabId; labelKey: string; icon: typeof Activity }> = [
  { id: 'overview', labelKey: 'modal.overview', icon: Activity },
  { id: 'timeline', labelKey: 'modal.timeline', icon: Clock },
  { id: 'rawdata', labelKey: 'modal.rawData', icon: FileText },
  { id: 'actions', labelKey: 'modal.actions', icon: CheckCircle },
]

const severityStyles: Record<Severity, string> = {
  critical: 'badge-critical',
  high: 'badge-high',
  medium: 'badge-medium',
  low: 'badge-low',
}

const statusStyles: Record<EventStatus, { bg: string; text: string }> = {
  new: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  investigating: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  resolved: { bg: 'bg-green-500/20', text: 'text-green-400' },
  false_positive: { bg: 'bg-slate-500/20', text: 'text-slate-400' },
}

function recommendedPlaybookName(event: SecurityEvent | null, playbooks: Playbook[]): Playbook | null {
  if (!event || playbooks.length === 0) return null
  const type = (event.event_type || '').toLowerCase()
  const desc = (event.description || '').toLowerCase()
  const haystack = `${type} ${desc}`

  const find = (kw: string) =>
    playbooks.find((p) => p.name.toLowerCase().includes(kw))

  if (haystack.includes('brute') || haystack.includes('auth_failure') || haystack.includes('ssh')) {
    return find('brute') ?? null
  }
  if (haystack.includes('malware') || haystack.includes('ransom')) {
    return find('malware') ?? null
  }
  if (haystack.includes('scan') || haystack.includes('port')) {
    return find('scan') ?? null
  }
  return null
}

function extractContext(event: SecurityEvent): Record<string, string> {
  const m = event.metadata as Record<string, string | null> | null
  if (!m) return {}
  const ctx: Record<string, string> = {}
  const ip = m.source_ip ?? m.attacker_ip
  if (ip) ctx['Source IP'] = ip
  const user = m.user ?? m.target_user
  if (user) ctx['User'] = user
  if (m.hostname) ctx['Host'] = m.hostname
  if (m.port) ctx['Port'] = String(m.port)
  if (m.attempts) ctx['Attempts'] = String(m.attempts)
  if (m.signature) ctx['Signature'] = m.signature
  if (m.protocol) ctx['Protocol'] = m.protocol
  if (m.dest_ip) ctx['Dest IP'] = m.dest_ip
  return ctx
}

function buildTimelineFromData(event: SecurityEvent, comments: AlertComment[]): TimelineEvent[] {
  const entries: TimelineEvent[] = [
    {
      id: 'ingested',
      timestamp: event.timestamp,
      action: 'Event ingested',
      actor: 'System',
      details: `${event.source} reported ${event.event_type}`,
      context: extractContext(event),
    },
  ]

  const wasUpdated = event.updated_at && event.updated_at !== event.timestamp &&
    new Date(event.updated_at).getTime() > new Date(event.timestamp).getTime()

  if (wasUpdated) {
    if (event.assigned_to) {
      entries.push({
        id: 'assigned',
        timestamp: event.updated_at!,
        action: 'Assigned to analyst',
        actor: 'System',
        details: `Assigned to ${event.assigned_to}`,
      })
    }
    if (event.status !== 'new') {
      entries.push({
        id: 'status-change',
        timestamp: event.updated_at!,
        action: `Status changed to ${event.status.replace('_', ' ')}`,
        actor: event.assigned_to ?? 'Analyst',
        details: null as unknown as string,
      })
    }
  }

  const sorted = [...comments].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
  for (const c of sorted) {
    entries.push({
      id: c.id,
      timestamp: c.created_at,
      action: 'Comment added',
      actor: c.author,
      details: c.content,
    })
  }

  return entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}

export default function AlertDetailModal({
  eventId,
  isOpen,
  onClose,
  onUpdate,
}: AlertDetailModalProps) {
  const { canAssign, canExport } = useRole()
  const { t, locale } = useLanguage()
  const { addPlaybookNotification } = useNotification()
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [event, setEvent] = useState<SecurityEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [comments, setComments] = useState<AlertComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [analysts, setAnalysts] = useState<Analyst[]>([])
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [actionStates, setActionStates] = useState<Record<string, 'idle' | 'done'>>({})
  const [showPlaybookPicker, setShowPlaybookPicker] = useState(false)
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [loadingPlaybooks, setLoadingPlaybooks] = useState(false)

  useEffect(() => {
    if (isOpen && eventId) {
      setActionStates({})
      setShowPlaybookPicker(false)
      setActiveTab('overview')
      loadEventData()
    }
  }, [isOpen, eventId])

  async function loadEventData() {
    if (!eventId) return
    setLoading(true)
    try {
      const eventData = await fetchEvent(eventId)
      setEvent(eventData)

      // Load analysts from API
      try {
        const analyticsData = await fetchAnalysts()
        setAnalysts(analyticsData.analysts || [])
      } catch {
        setAnalysts([])
      }

      // Load comments then build real timeline from event + comments
      let loadedComments: AlertComment[] = []
      try {
        const commentsData = await fetchEventComments(eventId)
        loadedComments = commentsData.comments || []
        setComments(loadedComments)
      } catch {
        setComments([])
      }
      setTimeline(buildTimelineFromData(eventData, loadedComments))

      // Pre-fetch active playbooks so the Recommended banner can render
      try {
        const pbData = await fetchPlaybooks({ status: 'active' })
        setPlaybooks(pbData.playbooks || [])
      } catch {
        // banner will simply not render — non-fatal
      }
    } catch (error) {
      console.error('Failed to load event:', error)
      toast.error(t('common.loading'))
    } finally {
      setLoading(false)
    }
  }

  async function handleStatusChange(newStatus: EventStatus) {
    if (!event) return
    setSaving(true)
    try {
      const updated = await updateEventStatus(event.id, { status: newStatus })
      setEvent(updated)
      onUpdate?.(updated)
      toast.success(`Status updated to ${newStatus.replace('_', ' ')}`)

      // Add to timeline
      setTimeline((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          action: `Status changed to ${newStatus}`,
          actor: 'Current User',
        },
      ])
    } catch (error) {
      console.error('Failed to update status:', error)
      toast.error('Failed to update status')
    } finally {
      setSaving(false)
    }
  }

  async function handleAssign(analystId: string) {
    if (!event) return
    const analyst = analysts.find((a) => a.id === analystId)
    if (!analyst) return

    setSaving(true)
    try {
      const updated = await updateEventStatus(event.id, { assigned_to: analyst.name })
      setEvent(updated)
      onUpdate?.(updated)
      toast.success(`Assigned to ${analyst.name}`)

      setTimeline((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          action: `Assigned to ${analyst.name}`,
          actor: 'Current User',
        },
      ])
    } catch (error) {
      console.error('Failed to assign:', error)
      toast.error('Failed to assign analyst')
    } finally {
      setSaving(false)
    }
  }

  async function runPlaybook(pb: Playbook) {
    if (!event) return
    setSaving(true)
    try {
      await executePlaybook(pb.id, {
        eventId: event.id,
        startedBy: 'Current User',
      })
      toast.success(`Playbook "${pb.name}" launched`)
      addPlaybookNotification(pb.name)
      setActionStates((prev) => ({ ...prev, playbook: 'done' }))
      setTimeline((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          action: `Playbook "${pb.name}" launched`,
          actor: 'Current User',
        },
      ])
    } catch {
      toast.error(`Failed to execute "${pb.name}"`)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddComment() {
    if (!event || !newComment.trim()) return
    try {
      // Try API first, fallback to local
      let addedComment: AlertComment
      try {
        addedComment = await addEventComment(event.id, newComment)
      } catch {
        addedComment = {
          id: Date.now().toString(),
          event_id: event.id,
          author: 'Demo User',
          content: newComment,
          created_at: new Date().toISOString(),
        }
      }
      setComments((prev) => [...prev, addedComment])
      setTimeline((prev) => [
        ...prev,
        {
          id: addedComment.id,
          timestamp: addedComment.created_at,
          action: 'Comment added',
          actor: addedComment.author,
          details: addedComment.content,
        },
      ])
      setNewComment('')
      toast.success('Comment added')
    } catch (error) {
      toast.error('Failed to add comment')
    }
  }

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" title={t('alerts.viewDetails')}>
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner size="lg" />
        </div>
      ) : event ? (
        <div className="flex flex-col">
          {/* Header info */}
          <div className="px-6 py-4 border-b border-slate-700/50 bg-slate-800/50">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className={clsx(
                      'px-3 py-1 text-sm font-medium rounded-full',
                      severityStyles[event.severity]
                    )}
                  >
                    {event.severity.toUpperCase()}
                  </span>
                  <span
                    className={clsx(
                      'px-3 py-1 text-sm rounded-full',
                      statusStyles[event.status].bg,
                      statusStyles[event.status].text
                    )}
                  >
                    {event.status.replace('_', ' ')}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-slate-100">{event.description}</h3>
                <div className="flex items-center gap-4 mt-2 text-sm text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {new Date(event.timestamp).toLocaleString(locale())}
                  </span>
                  <span className="flex items-center gap-1">
                    <Server className="w-4 h-4" />
                    {event.source}
                  </span>
                  {event.site_id && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {event.site_id}
                    </span>
                  )}
                </div>
              </div>
              {canExport && (
                <button
                  onClick={() => {
                    exportIncidentReport(event, timeline, comments, null, locale())
                    toast.success('Incident report exported')
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors shrink-0"
                  title="Export this incident as PDF (overview, triage, timeline, comments)"
                >
                  <Download className="w-4 h-4" />
                  Export
                </button>
              )}
            </div>
          </div>

          {/* Recommended Playbook CTA */}
          {(() => {
            const recommended = recommendedPlaybookName(event, playbooks)
            if (!recommended || actionStates.playbook === 'done') return null
            return (
              <div className="px-6 py-3 border-b border-slate-700/50 bg-gradient-to-r from-violet-500/10 via-blue-500/10 to-transparent">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-violet-500/20 text-violet-300 shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wider text-violet-300 font-semibold">
                        {t('modal.recommended') || 'Recommended'}
                      </p>
                      <p className="text-sm text-slate-100 font-medium truncate">
                        {recommended.name}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => runPlaybook(recommended)}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-50 shrink-0"
                  >
                    <PlayCircle className="w-4 h-4" />
                    Run now
                  </button>
                </div>
              </div>
            )
          })()}

          {/* Tabs */}
          <div className="flex border-b border-slate-700/50">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    'flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors',
                    activeTab === tab.id
                      ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
                      : 'text-slate-400 hover:text-slate-200'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {t(tab.labelKey)}
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div className="p-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Affected assets */}
                <div>
                  <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">
                    {t('modal.affectedAssets')}
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-700/30 rounded-lg">
                      <p className="text-xs text-slate-500 mb-1">{t('modal.sourceIP')}</p>
                      <p className="font-mono text-slate-200">
                        {(event.metadata as Record<string, unknown>)?.source_ip as string || 'N/A'}
                      </p>
                    </div>
                    <div className="p-4 bg-slate-700/30 rounded-lg">
                      <p className="text-xs text-slate-500 mb-1">{t('modal.hostname')}</p>
                      <p className="font-mono text-slate-200">
                        {(event.metadata as Record<string, unknown>)?.hostname as string || 'N/A'}
                      </p>
                    </div>
                    <div className="p-4 bg-slate-700/30 rounded-lg">
                      <p className="text-xs text-slate-500 mb-1">{t('modal.user')}</p>
                      <p className="text-slate-200">
                        {(event.metadata as Record<string, unknown>)?.user as string || 'N/A'}
                      </p>
                    </div>
                    <div className="p-4 bg-slate-700/30 rounded-lg">
                      <p className="text-xs text-slate-500 mb-1">{t('modal.eventType')}</p>
                      <p className="text-slate-200">{event.event_type}</p>
                    </div>
                  </div>
                </div>

                {/* Assignment */}
                <div>
                  <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">
                    {t('modal.assignment')}
                  </h4>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-slate-500" />
                      <span className="text-slate-300">
                        {event.assigned_to || t('modal.unassigned')}
                      </span>
                    </div>
                    {canAssign && (
                      <select
                        className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value=""
                        onChange={(e) => handleAssign(e.target.value)}
                        disabled={saving}
                      >
                        <option value="">{t('modal.assignTo')}</option>
                        {analysts.map((analyst) => (
                          <option key={analyst.id} value={analyst.id}>
                            {analyst.name} ({analyst.role})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Comments */}
                <div>
                  <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">
                    <MessageSquare className="w-4 h-4 inline mr-2" />
                    {t('modal.notesComments')}
                  </h4>
                  <div className="space-y-3 mb-4">
                    {comments.length === 0 ? (
                      <p className="text-sm text-slate-500 italic">{t('modal.noComments')}</p>
                    ) : (
                      comments.map((comment) => (
                        <div key={comment.id} className="p-3 bg-slate-700/30 rounded-lg">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-slate-300">
                              {comment.author}
                            </span>
                            <span className="text-xs text-slate-500">
                              {new Date(comment.created_at).toLocaleString(locale())}
                            </span>
                          </div>
                          <p className="text-sm text-slate-400">{comment.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={t('modal.addComment')}
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                      className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleAddComment}
                      disabled={!newComment.trim()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'timeline' && (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-700" />
                <div className="space-y-6">
                  {timeline.map((item, index) => (
                    <div key={item.id} className="relative pl-10">
                      <div
                        className={clsx(
                          'absolute left-2 w-4 h-4 rounded-full border-2 bg-slate-800',
                          index === 0 ? 'border-blue-500' : 'border-slate-600'
                        )}
                      />
                      <div className="p-4 bg-slate-700/30 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-slate-200">{item.action}</span>
                          <span className="text-sm text-slate-300">
                            {new Date(item.timestamp).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}
                          </span>
                        </div>
                        <p className="text-sm text-slate-400">By: {item.actor}</p>
                        {item.details && (
                          <p className="text-sm text-slate-500 mt-1">{item.details}</p>
                        )}
                        {item.context && Object.keys(item.context).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {Object.entries(item.context).map(([k, v]) => (
                              <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-700/60 border border-slate-600/50">
                                <span className="text-slate-400">{k}:</span>
                                <span className="text-slate-200 font-mono">{v}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'rawdata' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-2">
                    {t('modal.rawLog')}
                  </h4>
                  <pre className="p-4 bg-slate-900 rounded-lg text-sm text-green-400 font-mono overflow-x-auto whitespace-pre-wrap">
                    {event.raw_log || t('modal.noRawLog')}
                  </pre>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-2">
                    {t('modal.metadataJson')}
                  </h4>
                  <pre className="p-4 bg-slate-900 rounded-lg text-sm text-blue-400 font-mono overflow-x-auto">
                    {JSON.stringify(event.metadata, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {activeTab === 'actions' && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
                    {t('modal.changeStatus')}
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleStatusChange('investigating')}
                      disabled={saving || event.status === 'investigating'}
                      className={clsx(
                        'flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all',
                        event.status === 'investigating'
                          ? 'bg-yellow-500/30 text-yellow-400 cursor-default'
                          : 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
                      )}
                    >
                      <AlertTriangle className="w-5 h-5" />
                      {t('modal.investigating')}
                    </button>
                    <button
                      onClick={() => handleStatusChange('resolved')}
                      disabled={saving || event.status === 'resolved'}
                      className={clsx(
                        'flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all',
                        event.status === 'resolved'
                          ? 'bg-green-500/30 text-green-400 cursor-default'
                          : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                      )}
                    >
                      <CheckCircle className="w-5 h-5" />
                      {t('modal.markResolved')}
                    </button>
                    <button
                      onClick={() => handleStatusChange('false_positive')}
                      disabled={saving || event.status === 'false_positive'}
                      className={clsx(
                        'flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all',
                        event.status === 'false_positive'
                          ? 'bg-slate-500/30 text-slate-400 cursor-default'
                          : 'bg-slate-500/10 text-slate-400 hover:bg-slate-500/20'
                      )}
                    >
                      <FileText className="w-5 h-5" />
                      {t('modal.falsePositive')}
                    </button>
                    <button
                      onClick={() => toast.info(t('modal.escalateHint'))}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg font-medium transition-all"
                    >
                      <ArrowUpCircle className="w-5 h-5" />
                      {t('modal.escalate')}
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
                    {t('modal.quickActions')}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'ticket', labelKey: 'modal.createTicket', doneLabelKey: 'modal.ticketCreated' },
                      { key: 'block_ip', labelKey: 'modal.blockSourceIP', doneLabelKey: 'modal.ipBlocked' },
                      { key: 'isolate', labelKey: 'modal.isolateEndpoint', doneLabelKey: 'modal.endpointIsolated' },
                    ].map((action) => {
                      const isDone = actionStates[action.key] === 'done'
                      return (
                        <button
                          key={action.key}
                          onClick={() => {
                            if (isDone) {
                              setActionStates((prev) => ({ ...prev, [action.key]: 'idle' }))
                              toast.info(`${t(action.labelKey)} undone`)
                              setTimeline((prev) => prev.filter((tl) => tl.action !== t(action.doneLabelKey)))
                            } else {
                              setActionStates((prev) => ({ ...prev, [action.key]: 'done' }))
                              toast.success(t(action.doneLabelKey))
                              setTimeline((prev) => [
                                ...prev,
                                {
                                  id: Date.now().toString(),
                                  timestamp: new Date().toISOString(),
                                  action: t(action.doneLabelKey),
                                  actor: 'Current User',
                                },
                              ])
                            }
                          }}
                          className={clsx(
                            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                            isDone
                              ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          )}
                        >
                          {isDone && <Check className="w-4 h-4" />}
                          {isDone ? t(action.doneLabelKey) : t(action.labelKey)}
                        </button>
                      )
                    })}

                    {/* Run Playbook — real picker */}
                    <div className="relative">
                      <button
                        onClick={async () => {
                          if (actionStates.playbook === 'done') {
                            setActionStates((prev) => ({ ...prev, playbook: 'idle' }))
                            setShowPlaybookPicker(false)
                            toast.info(`${t('modal.runPlaybook')} ${t('modal.undone')}`)
                            setTimeline((prev) => prev.filter((t) => !t.action.startsWith('Playbook "')))
                            return
                          }
                          if (showPlaybookPicker) {
                            setShowPlaybookPicker(false)
                            return
                          }
                          setLoadingPlaybooks(true)
                          setShowPlaybookPicker(true)
                          try {
                            const data = await fetchPlaybooks({ status: 'active' })
                            setPlaybooks(data.playbooks || [])
                          } catch {
                            toast.error('Failed to load playbooks')
                            setShowPlaybookPicker(false)
                          } finally {
                            setLoadingPlaybooks(false)
                          }
                        }}
                        className={clsx(
                          'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                          actionStates.playbook === 'done'
                            ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        )}
                      >
                        {actionStates.playbook === 'done' && <Check className="w-4 h-4" />}
                        {actionStates.playbook === 'done' ? t('modal.playbookLaunched') : t('modal.runPlaybook')}
                      </button>

                      {showPlaybookPicker && (
                        <div className="absolute bottom-full mb-2 left-0 w-72 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20">
                          <div className="p-3 border-b border-slate-700">
                            <h4 className="text-sm font-medium text-slate-200">{t('modal.selectPlaybook')}</h4>
                          </div>
                          {loadingPlaybooks ? (
                            <div className="p-4 text-center text-slate-500 text-sm">{t('common.loading')}</div>
                          ) : playbooks.length === 0 ? (
                            <div className="p-4 text-center text-slate-500 text-sm">{t('modal.noPlaybooks')}</div>
                          ) : (
                            <div className="max-h-48 overflow-y-auto py-1">
                              {playbooks.map((pb) => {
                                const isRecommended = event && (
                                  (event.event_type?.includes('brute') && pb.category === 'incident') ||
                                  (event.event_type?.includes('malware') && pb.category === 'remediation') ||
                                  (event.event_type?.includes('scan') && pb.category === 'incident') ||
                                  (event.severity === 'critical' && pb.category === 'incident')
                                )
                                return (
                                  <button
                                    key={pb.id}
                                    onClick={async () => {
                                      setShowPlaybookPicker(false)
                                      await runPlaybook(pb)
                                    }}
                                    className="w-full px-3 py-2 text-left hover:bg-slate-700 transition-colors flex items-center justify-between"
                                  >
                                    <div className="min-w-0">
                                      <span className="text-sm text-slate-200 block truncate">{pb.name}</span>
                                      {pb.description && (
                                        <span className="block text-xs text-slate-500 truncate">{pb.description.slice(0, 60)}</span>
                                      )}
                                    </div>
                                    {isRecommended && (
                                      <span className="ml-2 shrink-0 px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">
                                        {t('modal.recommended')}
                                      </span>
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-700/50 bg-slate-800/50 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-slate-200 transition-colors"
            >
              {t('modal.close')}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-6 text-center text-slate-400">{t('modal.eventNotFound')}</div>
      )}
    </Modal>
  )
}
