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
