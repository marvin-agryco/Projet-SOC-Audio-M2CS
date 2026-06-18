/** Shared formatters for alert rule condition/action display. */

export const EVENT_SOURCES = [
  { value: 'any',              label: 'Any Source' },
  { value: 'firewall',         label: 'Firewall' },
  { value: 'ids',              label: 'IDS' },
  { value: 'endpoint',         label: 'Endpoint' },
  { value: 'active_directory', label: 'Active Directory' },
  { value: 'email',            label: 'Email Gateway' },
  { value: 'application',      label: 'Application' },
  { value: 'network',          label: 'Network' },
]

export const EVENT_TYPES = [
  { value: 'any',                  label: 'Any Event Type' },
  { value: 'auth_failure',         label: 'Authentication Failure' },
  { value: 'auth_success',         label: 'Authentication Success' },
  { value: 'malware_detected',     label: 'Malware Detected' },
  { value: 'port_scan',            label: 'Port Scan' },
  { value: 'brute_force',          label: 'Brute Force Attack' },
  { value: 'data_exfiltration',    label: 'Data Exfiltration' },
  { value: 'policy_violation',     label: 'Policy Violation' },
  { value: 'config_change',        label: 'Configuration Change' },
  { value: 'privilege_escalation', label: 'Privilege Escalation' },
  { value: 'suspicious_process',   label: 'Suspicious Process' },
  { value: 'network_anomaly',      label: 'Network Anomaly' },
]

export function formatEventType(key: string): string {
  return EVENT_TYPES.find(e => e.value === key)?.label ?? key
}

export function formatSource(key: string): string {
  return EVENT_SOURCES.find(s => s.value === key)?.label ?? key
}

export function formatTimeframe(tf: string): string {
  const match = tf.match(/(\d+)([mh])/)
  if (!match) return tf
  const [, num, unit] = match
  return unit === 'm' ? `${num} min` : `${num}h`
}

export function formatCondition(condition: Record<string, unknown>): string {
  const parts: string[] = []
  const et = condition.event_type as string | undefined
  const src = condition.source as string | undefined
  const count = condition.count as number | undefined
  const tf = condition.timeframe as string | undefined

  if (et && et !== 'any') parts.push(formatEventType(et))
  if (src && src !== 'any') parts.push(`from ${formatSource(src)}`)
  if (count)                parts.push(`≥ ${count} events`)
  if (tf)                   parts.push(`within ${formatTimeframe(tf)}`)

  return parts.length > 0 ? parts.join(' · ') : 'Any event'
}

/**
 * Natural-language one-liner for a rule condition.
 * Accepts an optional translator. If absent, returns English.
 * "Trigger when ≥ 5 Authentication Failure events from Firewall within 10 min"
 */
export function describeCondition(
  condition: Record<string, unknown>,
  t?: (key: string) => string,
): string {
  const tr = t ?? ((k: string) => {
    const fallback: Record<string, string> = {
      'condDesc.trigger': 'Trigger when',
      'condDesc.event': 'event',
      'condDesc.events': 'events',
      'condDesc.from': 'from',
      'condDesc.severity': 'severity',
      'condDesc.atSite': 'at site',
      'condDesc.within': 'within',
      'condDesc.anyEvent': 'Any event',
    }
    return fallback[k] ?? k
  })

  const et = (condition.event_type as string | undefined) ?? 'any'
  const src = (condition.source as string | undefined) ?? 'any'
  const sev = (condition.severity as string | undefined) ?? 'any'
  const count = Math.max(1, Number(condition.count ?? 1))
  const tf = (condition.timeframe as string | undefined) ?? ''
  const site = (condition.site_id as string | undefined) ?? ''

  const noun =
    et && et !== 'any'
      ? formatEventType(et).toLowerCase() + ' ' + (count > 1 ? tr('condDesc.events') : tr('condDesc.event'))
      : (count > 1 ? tr('condDesc.events') : tr('condDesc.event'))

  const filters: string[] = []
  if (src && src !== 'any') filters.push(`${tr('condDesc.from')} ${formatSource(src)}`)
  if (sev && sev !== 'any') filters.push(`${tr('condDesc.severity')} ${sev}`)
  if (site && site !== 'any') filters.push(`${tr('condDesc.atSite')} ${site}`)

  const subject = `${count >= 1 ? `≥ ${count}` : ''} ${noun}`.trim()
  const filterStr = filters.length ? ' ' + filters.join(' ') : ''
  const window = tf && tf !== 'any' ? ` ${tr('condDesc.within')} ${formatTimeframe(tf)}` : ''
  return `${tr('condDesc.trigger')} ${subject}${filterStr}${window}`.replace(/\s+/g, ' ').trim()
}

/** Stable signature for overlap detection. */
export function conditionSignature(condition: Record<string, unknown>): string {
  const k = (v: unknown) => (v === undefined || v === null || v === '' ? 'any' : String(v))
  return [
    k(condition.event_type),
    k(condition.source),
    k(condition.severity),
    k(condition.site_id),
  ].join('::')
}
