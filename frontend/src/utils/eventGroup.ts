import { SecurityEvent } from '../types'

export interface EventGroup {
  key: string
  events: SecurityEvent[]
  representative: SecurityEvent
  count: number
  uniqueIps: string[]
  firstTime: string
  lastTime: string
  timeSpanSec: number
  isBurst: boolean
}

const DEFAULT_WINDOW_MS = 5 * 60 * 1000
const BURST_MIN_COUNT = 5
const BURST_MAX_SPAN_SEC = 10

function readSourceIp(event: SecurityEvent): string | undefined {
  const meta = event.metadata as Record<string, unknown> | undefined
  if (!meta) return undefined
  const candidates = ['source_ip', 'attacker_ip', 'src_ip']
  for (const k of candidates) {
    const v = meta[k]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return undefined
}

export function groupEvents(events: SecurityEvent[], windowMs = DEFAULT_WINDOW_MS): EventGroup[] {
  const groups: EventGroup[] = []
  for (const event of events) {
    const key = [
      event.event_type,
      event.description,
      event.source,
      event.site_id ?? '',
      event.severity,
    ].join('::')
    const tMs = new Date(event.timestamp).getTime()
    const ip = readSourceIp(event)

    const existing = groups.find((g) => {
      if (g.key !== key) return false
      const firstMs = new Date(g.firstTime).getTime()
      const lastMs = new Date(g.lastTime).getTime()
      return tMs >= firstMs - windowMs && tMs <= lastMs + windowMs
    })

    if (existing) {
      existing.events.push(event)
      existing.count = existing.events.length
      if (ip && !existing.uniqueIps.includes(ip)) existing.uniqueIps.push(ip)
      if (tMs < new Date(existing.firstTime).getTime()) existing.firstTime = event.timestamp
      if (tMs > new Date(existing.lastTime).getTime()) existing.lastTime = event.timestamp
      const span =
        (new Date(existing.lastTime).getTime() - new Date(existing.firstTime).getTime()) / 1000
      existing.timeSpanSec = span
      existing.isBurst = existing.count >= BURST_MIN_COUNT && span < BURST_MAX_SPAN_SEC
    } else {
      groups.push({
        key,
        events: [event],
        representative: event,
        count: 1,
        uniqueIps: ip ? [ip] : [],
        firstTime: event.timestamp,
        lastTime: event.timestamp,
        timeSpanSec: 0,
        isBurst: false,
      })
    }
  }
  return groups
}

export function getSourceIp(event: SecurityEvent): string | undefined {
  return readSourceIp(event)
}

export function isFreshEvent(event: SecurityEvent, freshMs = 5 * 60 * 1000): boolean {
  const t = new Date(event.timestamp).getTime()
  return Date.now() - t < freshMs
}
