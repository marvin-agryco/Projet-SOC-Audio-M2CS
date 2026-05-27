const TZ = 'Europe/Paris'

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { timeZone: TZ, day: '2-digit', month: '2-digit' })
}
