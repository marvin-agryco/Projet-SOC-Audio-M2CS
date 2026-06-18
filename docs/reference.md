# API & Data Reference

All endpoints are prefixed with `/api`.

## Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Authenticate user, returns JWT token |
| POST | `/api/auth/register` | Register a new user |
| GET | `/api/auth/me` | Get current authenticated user |
| POST | `/api/auth/refresh` | Refresh JWT token |
| POST | `/api/auth/logout` | Logout (client discards token) |
| POST | `/api/auth/init-demo` | Initialize demo users |

## Events

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events` | List events (filters: `severity`, `status`, `source`, `event_type`, `site_id`, `search`; paginated) |
| GET | `/api/events/:id` | Get single event |
| PATCH | `/api/events/:id/status` | Update event status and assignment |
| DELETE | `/api/events/:id` | Delete an event |
| GET | `/api/events/:id/comments` | List event comments |
| POST | `/api/events/:id/comments` | Add comment to event |

## Ingestion

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ingest` | Ingest a single security event |
| POST | `/api/ingest/batch` | Ingest multiple events at once |

## Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats` | Statistics (by_severity, by_source, by_status, total_rule_triggers, critical_open) |
| GET | `/api/dashboard/trends` | Event trends (timeframe: `5m`, `15m`, `30m`, `1h`, `6h`, `24h`, `7d`, `30d`) |
| GET | `/api/dashboard/sites` | Summary by site |
| GET | `/api/dashboard/heatmap` | Activity heatmap (7 days × 24 hours event density) |
| GET | `/api/dashboard/top-ips` | Top 10 source IPs by event count (param: `hours`, default 24) |

## Alert Rules

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/alerts/rules` | List all alert rules |
| POST | `/api/alerts/rules` | Create alert rule |
| GET | `/api/alerts/rules/:id` | Get single alert rule |
| PATCH | `/api/alerts/rules/:id` | Update alert rule |
| DELETE | `/api/alerts/rules/:id` | Delete alert rule |
| POST | `/api/alerts/rules/:id/toggle` | Enable/disable alert rule |

## Incidents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/incidents` | List incidents (filters: `severity`, `status`, `assigned_to`; paginated) |
| GET | `/api/incidents/:id` | Get incident + linked events |
| PATCH | `/api/incidents/:id` | Update status, severity, assignment |

## Playbooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/playbooks` | List playbooks (filters: `status`, `category`) |
| GET | `/api/playbooks/:id` | Get single playbook |
| POST | `/api/playbooks` | Create playbook |
| PATCH | `/api/playbooks/:id` | Update playbook |
| DELETE | `/api/playbooks/:id` | Delete playbook |
| POST | `/api/playbooks/:id/duplicate` | Duplicate as new draft |
| POST | `/api/playbooks/:id/toggle` | Toggle active/draft status |
| POST | `/api/playbooks/:id/archive` | Archive playbook |
| POST | `/api/playbooks/:id/execute` | Start playbook execution |

## Playbook Executions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/playbook-executions` | List executions (filters: `status`, `playbook_id`, `active`) |
| GET | `/api/playbook-executions/:id` | Get execution details |
| PATCH | `/api/playbook-executions/:id/steps/:index` | Update step status |
| POST | `/api/playbook-executions/:id/abort` | Abort in-progress execution |
| POST | `/api/playbook-executions/:id/complete` | Mark execution as complete |

## Endpoints & Assets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/endpoints` | List monitored endpoints (filters: `status`, `limit`) |
| GET | `/api/endpoints/:id` | Get single endpoint |
| GET | `/api/analysts` | List available analysts |
| GET | `/api/assets` | List GLPI computers |
| GET | `/api/assets/:name` | Lookup asset by hostname |

---

## Event Data Structure

```json
{
  "id": "uuid",
  "timestamp": "2025-01-15T10:30:00Z",
  "source": "firewall|endpoint|application",
  "event_type": "auth_failure|port_scan|malware_detected|data_exfiltration",
  "severity": "critical|high|medium|low",
  "description": "Human readable summary",
  "raw_log": "Original log entry",
  "metadata": {
    "source_ip": "192.168.1.100",
    "dest_ip": "10.0.0.50",
    "user": "jdoe"
  },
  "status": "new|investigating|resolved|false_positive",
  "assigned_to": "analyst_id",
  "site_id": "endpoint-pc-01",
  "incident_id": "uuid or null",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

## Severity Levels

| Level | Color | Description |
|-------|-------|-------------|
| **Critical** | Red | Immediate threat (active breach, ransomware) |
| **High** | Orange | Serious risk (multiple failed logins, port scanning) |
| **Medium** | Yellow | Potential issue (unusual traffic pattern) |
| **Low** | Blue | Informational (normal security event) |

## Alert Rule Format

```json
{
  "name": "Multiple Failed Logins",
  "condition": {
    "event_type": "auth_failure",
    "count": 5,
    "timeframe": "10m",
    "source": "any"
  },
  "action": "email",
  "severity": "high"
}
```
