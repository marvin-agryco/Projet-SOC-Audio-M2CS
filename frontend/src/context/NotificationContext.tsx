import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { useSocket } from '../hooks/useSocket'
import { fetchEvents } from '../api'
import { Severity, SecurityEvent } from '../types'

export interface Notification {
  id: string
  type: 'alert' | 'playbook'
  severity?: Severity
  title: string
  subtitle: string
  count: number
  timestamp: Date
  read: boolean
  siteId?: string
}

interface NotificationContextValue {
  notifications: Notification[]
  unreadCount: number
  markAllRead: () => void
  addPlaybookNotification: (name: string) => void
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  markAllRead: () => {},
  addPlaybookNotification: () => {},
})

function humanize(eventType: string): string {
  return eventType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function eventsToNotifications(events: SecurityEvent[]): Notification[] {
  const groups = new Map<string, Notification>()

  for (const event of events) {
    const key = event.event_type
    const existing = groups.get(key)
    if (existing) {
      existing.count++
      if (new Date(event.timestamp) > existing.timestamp) {
        existing.timestamp = new Date(event.timestamp)
        existing.siteId = event.site_id
        existing.severity = event.severity as Severity
      }
    } else {
      groups.set(key, {
        id: key,
        type: 'alert',
        severity: event.severity as Severity,
        title: humanize(event.event_type),
        subtitle: event.site_id ? `Source: ${event.site_id}` : `Source: ${event.source}`,
        count: 1,
        timestamp: new Date(event.timestamp),
        read: false,
        siteId: event.site_id,
      })
    }
  }

  return Array.from(groups.values()).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { socket } = useSocket()
  const [notifications, setNotifications] = useState<Notification[]>([])

  // Initial fetch of recent critical/high events
  useEffect(() => {
    fetchEvents({ severity: 'critical,high', status: 'new', limit: 50 })
      .then((data) => {
        setNotifications(eventsToNotifications(data.events || []))
      })
      .catch(() => setNotifications([]))
  }, [])

  // Live WebSocket updates
  useEffect(() => {
    if (!socket) return

    function handleNewEvent(event: SecurityEvent) {
      if (event.event_type === 'keepalive') return
      if (event.severity !== 'critical' && event.severity !== 'high') return

      setNotifications((prev) => {
        const key = event.event_type
        const idx = prev.findIndex((n) => n.type === 'alert' && n.id === key)

        if (idx !== -1) {
          const updated = [...prev]
          const existing = { ...updated[idx] }
          existing.count++
          existing.timestamp = new Date(event.timestamp)
          existing.siteId = event.site_id || existing.siteId
          existing.read = false
          updated[idx] = existing
          // Move updated group to top
          updated.splice(idx, 1)
          return [existing, ...updated].slice(0, 20)
        }

        const newEntry: Notification = {
          id: key,
          type: 'alert',
          severity: event.severity as Severity,
          title: humanize(event.event_type),
          subtitle: event.site_id ? `Source: ${event.site_id}` : `Source: ${event.source}`,
          count: 1,
          timestamp: new Date(event.timestamp),
          read: false,
          siteId: event.site_id,
        }
        return [newEntry, ...prev].slice(0, 20)
      })
    }

    socket.on('new_event', handleNewEvent)
    return () => { socket.off('new_event', handleNewEvent) }
  }, [socket])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const addPlaybookNotification = useCallback((name: string) => {
    const entry: Notification = {
      id: `playbook-${Date.now()}`,
      type: 'playbook',
      title: `Playbook Executed: ${name}`,
      subtitle: 'Action: Success',
      count: 1,
      timestamp: new Date(),
      read: false,
    }
    setNotifications((prev) => [entry, ...prev].slice(0, 20))
  }, [])

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAllRead, addPlaybookNotification }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotification() {
  return useContext(NotificationContext)
}
