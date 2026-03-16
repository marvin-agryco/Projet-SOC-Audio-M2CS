import { useEffect, useState, useCallback } from 'react'
import { Bot, RefreshCw, Check, Pencil, X, ExternalLink, AlertTriangle, Loader2 } from 'lucide-react'
import { TriageBrief } from '../types'
import { fetchTriageBrief, updateTriageBrief, retriageIncident } from '../api'
import { useSocket } from '../hooks/useSocket'

interface Props {
  incidentId: string
  analystName?: string
}

/** Color for the confidence bar: green ≥70, amber 40-69, red <40 */
function confidenceColor(score: number): string {
  if (score >= 70) return '#22c55e'  // green-500
  if (score >= 40) return '#f59e0b'  // amber-500
  return '#ef4444'                    // red-500
}

export default function TriageBriefPanel({ incidentId, analystName }: Props) {
  const { socket } = useSocket()

  const [brief, setBrief]       = useState<TriageBrief | null>(null)
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState(false)
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving]     = useState(false)
  const [retriaging, setRetriaging] = useState(false)

  const load = useCallback(async () => {
    try {
      const b = await fetchTriageBrief(incidentId)
      setBrief(b)
    } catch {
      // silently ignore — brief may not exist yet
    } finally {
      setLoading(false)
    }
  }, [incidentId])

  useEffect(() => {
    load()
  }, [load])

  // Poll every 3s while the brief is in-flight (Celery runs in a separate process,
  // so the WebSocket emission from the worker doesn't reach connected clients).
  // Stop polling as soon as we reach a terminal state.
  useEffect(() => {
    const inFlight = brief?.status === 'pending' || brief?.status === 'generating'
    if (!inFlight) return
    const interval = setInterval(load, 3000)
    return () => clearInterval(interval)
  }, [brief?.status, load])

  // WebSocket as a bonus fast-path (works when Flask server emits directly)
  useEffect(() => {
    if (!socket) return
    const handler = (data: { incident_id: string }) => {
      if (data.incident_id === incidentId) load()
    }
    socket.on('triage_update', handler)
    return () => { socket.off('triage_update', handler) }
  }, [socket, incidentId, load])

  async function handleAction(action: 'accept' | 'edit' | 'dismiss', notes?: string) {
    if (!brief) return
    setSaving(true)
    try {
      const updated = await updateTriageBrief(brief.id, {
        action,
        notes,
        analyst: analystName,
      })
      setBrief(updated)
      setEditing(false)
    } catch {
      // no-op — keep current state
    } finally {
      setSaving(false)
    }
  }

  async function handleRetriage() {
    setRetriaging(true)
    try {
      const newBrief = await retriageIncident(incidentId)
      setBrief(newBrief)
    } catch {
      // no-op
    } finally {
      setRetriaging(false)
    }
  }

  const isInFlight = brief?.status === 'pending' || brief?.status === 'generating'
  const isActionable = brief?.status === 'ready'
  const isReviewed = brief?.status === 'accepted' || brief?.status === 'edited' || brief?.status === 'dismissed'

  return (
    <div
      className="rounded-lg border mt-4"
      style={{ backgroundColor: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            AI Triage Brief
          </span>
          {brief?.status && (
            <span
              className="text-xs px-1.5 py-0.5 rounded font-medium"
              style={{
                backgroundColor:
                  brief.status === 'ready' ? 'rgb(139 92 246 / 0.15)' :
                  brief.status === 'accepted' ? 'rgb(34 197 94 / 0.15)' :
                  brief.status === 'failed' ? 'rgb(239 68 68 / 0.15)' :
                  'rgb(100 116 139 / 0.15)',
                color:
                  brief.status === 'ready' ? '#a78bfa' :
                  brief.status === 'accepted' ? '#4ade80' :
                  brief.status === 'failed' ? '#f87171' :
                  'var(--color-text-muted)',
              }}
            >
              {brief.status.toUpperCase()}
            </span>
          )}
        </div>
        <button
          onClick={handleRetriage}
          disabled={retriaging || isInFlight}
          title="Regenerate triage brief"
          className="p-1.5 rounded-lg hover:bg-slate-700/50 disabled:opacity-40 transition-colors"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${retriaging ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="px-4 py-3">
        {/* Loading / generating state */}
        {(loading || isInFlight) && (
          <div className="flex items-center gap-2 py-2" style={{ color: 'var(--color-text-muted)' }}>
            <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
            <span className="text-sm">
              {loading ? 'Loading...' : 'Generating triage brief...'}
            </span>
          </div>
        )}

        {/* No brief yet (and not loading) */}
        {!loading && !brief && (
          <p className="text-sm py-2" style={{ color: 'var(--color-text-muted)' }}>
            No triage brief yet.{' '}
            <button
              onClick={handleRetriage}
              disabled={retriaging}
              className="text-violet-400 hover:underline disabled:opacity-50"
            >
              Generate one
            </button>
          </p>
        )}

        {/* Failed state */}
        {brief?.status === 'failed' && (
          <div className="flex items-start gap-2 py-2">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-red-400 font-medium">Generation failed</p>
              {brief.error_message && (
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  {brief.error_message}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Ready / reviewed state */}
        {brief && ['ready', 'accepted', 'edited', 'dismissed'].includes(brief.status) && (
          <div className="space-y-3">
            {/* Confidence meter */}
            {brief.confidence !== null && (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                    Confidence
                  </span>
                  <span
                    className="text-xs font-bold"
                    style={{ color: confidenceColor(brief.confidence) }}
                  >
                    {brief.confidence}%
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ backgroundColor: 'var(--color-bg-secondary)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${brief.confidence}%`,
                      backgroundColor: confidenceColor(brief.confidence),
                    }}
                  />
                </div>
              </div>
            )}

            {/* Threat Hypothesis */}
            {brief.threat_hypothesis && (
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  Threat Hypothesis
                </p>
                {editing ? (
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={3}
                    className="w-full text-sm rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                    style={{
                      backgroundColor: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-primary)',
                    }}
                    placeholder="Add your analyst notes..."
                  />
                ) : (
                  <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                    {brief.threat_hypothesis}
                  </p>
                )}
              </div>
            )}

            {/* MITRE Tactics */}
            {brief.mitre_tactics.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  MITRE Tactics
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {brief.mitre_tactics.map((tactic) => (
                    <a
                      key={tactic}
                      href={`https://attack.mitre.org/techniques/${tactic}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium hover:bg-violet-500/30 transition-colors"
                      style={{
                        backgroundColor: 'rgb(139 92 246 / 0.15)',
                        color: '#a78bfa',
                      }}
                    >
                      {tactic}
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Recommended Action */}
            {brief.recommended_action && (
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  Recommended Action
                </p>
                <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                  {brief.recommended_action}
                </p>
              </div>
            )}

            {/* Analyst notes (post-review) */}
            {brief.analyst_notes && !editing && (
              <div
                className="rounded-lg p-2 text-xs"
                style={{
                  backgroundColor: 'rgb(99 102 241 / 0.08)',
                  borderLeft: '2px solid #6366f1',
                  color: 'var(--color-text-primary)',
                }}
              >
                <span className="font-medium" style={{ color: 'var(--color-text-muted)' }}>
                  Analyst note:{' '}
                </span>
                {brief.analyst_notes}
              </div>
            )}

            {/* Action buttons */}
            {isActionable && !editing && (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => handleAction('accept')}
                  disabled={saving}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600/20 hover:bg-green-600/30 text-green-400 transition-colors disabled:opacity-50"
                >
                  <Check className="w-3 h-3" /> Accept
                </button>
                <button
                  onClick={() => { setEditing(true); setEditNotes('') }}
                  disabled={saving}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 transition-colors disabled:opacity-50"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
                <button
                  onClick={() => handleAction('dismiss')}
                  disabled={saving}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700/50 hover:bg-slate-700 transition-colors disabled:opacity-50"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  <X className="w-3 h-3" /> Dismiss
                </button>
              </div>
            )}

            {/* Edit mode save/cancel */}
            {editing && (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => handleAction('edit', editNotes)}
                  disabled={saving}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Save
                </button>
                <button
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Generation footer */}
            {brief.generated_at && (
              <p className="text-xs pt-1 border-t" style={{
                color: 'var(--color-text-muted)',
                borderColor: 'var(--color-border)',
              }}>
                Generated{brief.generation_seconds ? ` in ${brief.generation_seconds}s` : ''} • {brief.model_used}
                {brief.generated_at && (
                  <> • {new Date(brief.generated_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</>
                )}
                {isReviewed && brief.reviewed_by && (
                  <> • Reviewed by {brief.reviewed_by}</>
                )}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
