# FEATURES.md

This file tracks all features implemented in the AudioSOC project.

---

## Core Platform Features

### Dashboard (v1.0)
- Real-time security event monitoring via WebSocket
- KPI cards showing event counts by severity
- Event Volume chart with configurable timeframes: 5m, 15m, 30m, 1h, 6h, 24h, 7d, 30d
- Critical events list with quick access
- Site summary overview (per monitored endpoint)
- Auto-refresh with live updates

### Events Management (v1.0)
- Event list with pagination
- Filter by severity, status, source, site
- Full-text search in descriptions
- Status workflow: `new` → `investigating` → `resolved` / `false_positive`
- Event assignment to analysts
- Comment system for event notes
- Export to CSV/PDF/JSON (v1.1)

### Alert Rules Engine (v1.0)
- CRUD operations for alert rules
- Threshold-based conditions (count + timeframe)
- Filter by event type, source, severity
- Actions: log, email, webhook
- Enable/disable toggle
- Rule templates for quick setup (v1.1)
- Rule duplication (v1.1)
- Expandable rule details (v1.1)

### Multi-Site Management (v1.0)
- Multi-center support (designed for ~30 audioprothésiste centers; demo uses endpoint-pc-01, endpoint-pc-02, firewall-gw)
- Per-site event filtering
- Site summary statistics
- Site-based WebSocket subscriptions

### Assets & Infrastructure Page (v1.2)
- Per-site event severity cards (critical / high / medium / low counts)
- **GLPI Asset Inventory table**: live data from GLPI API
  - Columns: Name, Comment, Serial, Entity, Created
  - Loading / empty / error states

### Event Ingestion (v1.0)
- REST API for event submission (`POST /api/ingest`)
- Batch ingestion (`POST /api/ingest/batch`)
- Input validation and sanitization
- Real-time WebSocket broadcast on ingestion
- Support for 3 event sources matching real infrastructure: firewall, endpoint, application (GLPI)

---

## Authentication & Authorization (v1.1)

### JWT Authentication
- Login/logout with JWT tokens
- Token refresh mechanism
- 24-hour token expiration
- Secure password hashing (bcrypt)

### User Roles
- **Admin**: Full system access
- **Analyst**: Event triage and investigation (read-only on rules/playbooks)
- **Supervisor**: Team oversight and reporting

### RBAC (RoleContext)
- `frontend/src/context/RoleContext.tsx` — permission source of truth
- Permission flags per role: `canAssign`, `canManageRules`, `canManagePlaybooks`, `canExport`
- Admin-only **VIEW AS** switcher in TopBar for live demos (switch displayed role without re-login)

### Demo Users
- Pre-configured demo accounts for testing
- Quick-fill credentials on login page

### Frontend Integration
- AuthContext + RoleContext for state management
- Protected routes
- Persistent sessions (localStorage)
- Auto-logout on token expiration

---

## Theme System (v1.1)

### Dark/Light Mode
- Toggle between dark and light themes
- System preference detection
- Persistent theme selection (localStorage)
- CSS variables for consistent theming

---

## Export & Reporting (v1.1)

### CSV Export
- Export filtered events to CSV
- Proper data escaping

### PDF Reports
- Direct PDF download via html2pdf.js (no print dialog)
- Styled report layout with AudioSOC branding
- Statistics summary + event table with severity badges

### JSON Export
- Full data export in JSON format
- Formatted output for readability

---

## Playbooks / Incident Response (v1.1)

### Playbook Management
- Create, edit, delete, archive playbooks
- Categories: incident, investigation, remediation, compliance
- Status: active, draft, archived

### Playbook Steps
- **Action**: Automated actions (isolate host, block IP, disable account)
- **Condition**: Branch based on conditions
- **Notification**: Send alerts (email, Slack, webhook)
- **Manual**: Require human approval

### Execution
- Step-by-step execution tracking
- Step status: pending, running, completed, failed, skipped
- Execution history and duration tracking

### Triggers
- Manual trigger
- Alert rule trigger
- Scheduled trigger (cron)

### Templates
- Pre-built playbook templates:
  - Ransomware Response
  - Phishing Investigation
  - Account Compromise
  - DDoS Response

---

## GLPI Integration (v1.2)

### Backend
- `GET /api/assets` — lists all computers from GLPI API
- `GET /api/assets/<name>` — single asset lookup by name
- Proxied through Flask backend (avoids CORS, centralizes auth)

### Frontend
- `GLPIAsset` TypeScript interface in `types.ts`
- `fetchAssets()` typed API call in `api.ts`
- Asset inventory table on Sites page (live data, loading/error states)

---

## Infrastructure Lab (v1.2)

Separate Docker Compose stack in `infrastructure/` simulating the client network.

### Wazuh SIEM Stack (4.14.2)
- **wazuh-manager**: log collection, agent management, alert rules
- **wazuh-indexer**: OpenSearch-based log storage
- **wazuh-dashboard**: web UI at `https://localhost:4443`
- SOC webhook integration: Wazuh alerts forwarded to `/api/ingest`

### Simulated Endpoints
- **endpoint-pc-01** / **endpoint-pc-02**: Ubuntu 22.04 + Wazuh agent
- Log generator producing realistic auth, sudo, cron, file integrity events
- Logs flow through Wazuh → SOC dashboard

### Firewall Container (v1.2)
- Ubuntu 22.04 + iptables, Wazuh agent registered as `firewall-gw`
- Dual-homed: `dmz-net` (172.25.0.0/24, external) + `infra-net` (internal)
- Real iptables rules: FORWARD DROP default, NAT masquerade, LOGGING chain
- Log generator writes realistic `IPTables-Dropped` / `HTTP-Access` syslog entries
- Logs collected by Wazuh → forwarded to SOC

### Suricata IDS Container
- Ubuntu 22.04 + Suricata (OISF PPA) + Wazuh agent 4.14.2
- Network: `dmz-net` only — monitors external-facing traffic
- EVE JSON log generator produces realistic Suricata alerts (ET OPEN signatures), DNS, HTTP, TLS events
- Wazuh integration: `log_format: json` for `/var/log/suricata/eve.json`; built-in rules 86xxx decode EVE format
- Custom rules 100200-100202 in `local_rules.xml` for severity escalation
- Source ID: `ids` (purple `#8b5cf6`) — displayed as `IDS / Suricata` in frontend
- Caps: `NET_RAW`, `SYS_NICE`

### GLPI (IT Asset Management)
- `diouxx/glpi` + MariaDB backend
- Pre-populated with 2 computers (endpoint-pc-01, endpoint-pc-02)
- REST API consumed by SOC backend

### Network Topology
```
[dmz-net 172.25.0.0/24]
        │
  [firewall-gw]  ← iptables NAT + Wazuh agent
  [suricata-ids] ← EVE JSON + Wazuh agent
        │
[infra-net]
   ├── endpoint-pc-01 → Wazuh agent
   ├── endpoint-pc-02 → Wazuh agent
   ├── glpi-crm (+ glpi-db)
   └── wazuh-manager → wazuh-indexer → wazuh-dashboard
                    └──→ SOC /api/ingest (via soc-network)
```

**Active event sources**: `firewall`, `endpoint`, `application` (GLPI), `ids` (Suricata) — 4 total

---

## Backend Infrastructure (v1.0)

### Celery Task Queue
- Alert rule evaluation every 10 seconds
- Async event processing
- Periodic cleanup tasks

### WebSocket (Socket.IO)
- Real-time event broadcasting
- Room-based subscriptions
- Connection status tracking

### Database (PostgreSQL)
- Event persistence with JSONB metadata
- Alert rules with JSONB conditions
- User management with roles

---

## Development Tools (v1.0)

### Log Generator Script
- Realistic security event simulation
- Normal traffic mode
- Attack scenario simulation
- Burst mode for spike testing
- Multi-site event distribution
- **Backfill mode**: Generate historical events spread across configurable time range
  - `--backfill`: Enable backfill mode
  - `--days N`: Number of days to backfill (default: 7)
  - `--count N`: Number of events to generate (default: 1000)

### Docker Deployment
- SOC stack: 5-service Docker Compose (`backend`, `frontend`, `db`, `redis`, `celery`)
- Infrastructure lab: 8-service Docker Compose (`wazuh` ×3, `endpoints` ×2, `glpi` ×2, `firewall`)
- Environment variable configuration
- Production-ready with Gunicorn

---

## Dashboard Analytics & UX (v1.3)

### Trend Indicators on StatCards
- **% change vs previous 24h** on Security Events and Critical Alerts cards
- Green/red arrows with percentage (TrendingUp / TrendingDown icons)
- Backend: `/dashboard/stats` now returns `events_prev_24h` and `critical_prev_24h`

### Event Volume Chart Enhancements
- Time range selector: `5m`, `15m`, `30m`, `1h`, `6h`, `24h`, `7d`, `30d`
- Clickable data points → navigate to Events page filtered by time
- Loading state during range changes

### Severity Trend Chart (7d / 30d)
- Stacked area chart showing daily breakdown by severity (critical, high, medium, low)
- Only visible when time range is `7d` or `30d`
- Backend: `/dashboard/trends` returns `daily` array with per-severity counts

### Activity Heatmap
- Weekly heatmap (7 days × 24 hours) showing event density
- Color intensity based on event count per hour-slot
- Backend: `GET /api/dashboard/heatmap` — aggregates events by day-of-week and hour

### Top Source IPs Widget
- Horizontal bar chart of top 10 source IPs (last 24h)
- Color-coded bars: red (critical), orange (high), blue (normal)
- Critical/high severity badges per IP
- Backend: `GET /api/dashboard/top-ips` — JSONB query on `metadata.source_ip`

### Alerts by Source (Donut Chart)
- Interactive donut chart with source breakdown (Firewall, Endpoints, GLPI)
- Click a slice to filter RecentAlertsTable by source
- Filter badge shown on table when active

### Recent Alerts Table Enhancements
- **Quick Actions column**: Eye (view details) + UserCheck (assign to me) buttons
- **Quick assignment**: one-click self-assign via `updateEventStatus`
- **Assignee dropdown**: click to reassign (admin/supervisor only via RBAC)
- **Live feed animation**: new entries flash blue highlight (`animate-new-entry`) and fade
- **Source filter**: linked to donut chart selection

### Alert Detail Modal — Quick Actions
- **Toggleable action buttons**: Create Ticket, Block Source IP, Isolate Endpoint, Run Playbook
- Instant visual feedback (green checkmark on click, re-clickable to undo)
- Actions logged in modal's timeline tab

### Endpoint Status Card Enhancements
- **Degraded/offline sub-text**: shows reason under endpoint name
  - Offline: `"{N} critical alert(s) detected"` (red)
  - Degraded: `"{N} events, high severity alerts"` (yellow)
- Click to open detail modal with health score, IP, location, event stats
- Quick actions: View Logs, Restart Services, Investigate

### Live Mode
- Toggle button (LIVE / Paused) in dashboard header
- Auto-refresh every 10 seconds when live
- Green pulsing indicator on alerts table

---

## SOC Analyst UX Improvements (v1.5)

### Language Consistency
- All UI strings standardized to **English** (previously mixed French/English)
- French day names, chart titles, and labels converted to English
- Date locale formatting (`fr-FR`) kept for timestamps

### Event Trend Color Fix
- **Security-context aware** trend indicators: more events = bad (red/amber), fewer events = good (green)
- Amber threshold for >50% deviation, red for >100% regardless of direction
- Previously showed green for increases (misleading in security context)

### Alert Grouping (Reduce Alert Fatigue)
- Duplicate alerts grouped by `alertName + source` in the Recent Alerts table
- Shows count badge (`23x`) next to grouped alert names
- Reduces 1,000 brute-force lines to a single grouped entry

### False Positive Quick Action
- `Ban` icon button in Recent Alerts table Actions column
- One-click false positive marking directly from dashboard (no need to open modal)

### IP Quick Actions (OSINT)
- Hover over any IP in Top Source IPs widget to reveal action menu
- **Whois Lookup** — opens who.is in new tab
- **VirusTotal** — opens VirusTotal IP page in new tab
- **Block IP** — simulated block action with toast confirmation

### Playbook Integration on Alerts
- "Run Playbook" in Alert Detail Modal now shows **real playbook picker**
- Fetches active playbooks from backend and displays selectable list
- **Recommended** badge on playbooks matching the event type/severity
- Executes playbook via backend API with event context (eventId, startedBy)

---

## Internationalization / i18n (v1.6)

### EN/FR Language Toggle
- One-click language toggle button in the **top header bar** (🇬🇧 EN / 🇫🇷 FR)
- Instant language switch — no page reload required
- Language persisted to `localStorage` (survives refresh)
- Default language: English

### Implementation
- **Lightweight i18n system** — no external library, uses React Context + translations dictionary
- `LanguageContext` provider with `t(key)` translation function
- `locale()` helper for date/number formatting (`en-US` / `fr-FR`)
- ~150 translation keys per language covering all dashboard components

### Translated Components
All dashboard-facing components use `t()` for user-visible strings:
- Dashboard (header, stat cards, live mode toggle)
- Sidebar navigation (Layout)
- TopBar (system status, user menu, notifications)
- Event Volume Chart, Severity Trend Chart, Activity Heatmap
- Recent Alerts Table (headers, empty states, action labels)
- Alert Detail Modal (tabs, fields, status buttons, quick actions, playbook picker)
- Endpoint Status Card (status labels, detail modal fields)
- Top Source IPs (title, action menu, OSINT links)
- StatCard (trend label)

---

## Dashboard V3 Redesign (v1.7)

### Activity Heatmap V3
- **Date-based grid**: real calendar dates (not day-of-week aggregation) — last 7 or 30 days × 24 hours
- **Severity breakdown per cell**: Critical / High / Med-Low counts shown in hover tooltip
- **7d / 30d toggle**: switch between weekly and monthly view; backend `GET /api/dashboard/heatmap?days=N`
- **Click-to-filter time slice**: click any cell to filter Recent Alerts table to that hour
- **Column crosshair guide** and selected-cell animation for clarity
- All labels fully translated (EN/FR) via `t()` — keys under `heatmap.*` namespace
- Backend `HeatmapEntry` now returns `{ date, hour, count, critical, high, medium, low }`

### StatCard Mission Critical Redesign
- **Sparkline SVG** rendered behind value at 20% opacity — `sparklineData?: number[]` prop
- **statusColor** prop (`normal | success | warning | critical`) — drives icon bg/border color and card tint
- **subValue** prop — secondary metric line below main value (replaces trend indicator slot when set)
- Backward-compatible: existing cards without new props remain unchanged

### Sources Health Panel
- Click the **Sources** stat card to open a right-side drawer showing real-time health per event source
- Each source card shows: ACTIVE / DISCONNECTED badge, last signal time, EPS (events/60s), 24h event count, and source-specific metadata
- **ACTIVE/DISCONNECTED logic**: primarily driven by `event_type="keepalive"` heartbeat events (< 10 min ago = ACTIVE); GLPI uses real-time HTTP check against the GLPI API on each request
- Sources order: Firewall → Endpoint → IDS / Suricata → Application (GLPI)
- Source-specific metadata: Firewall shows host label; Endpoint shows active agent count; IDS shows last rule signature; Application shows GLPI connected/timeout status

### Heartbeat-Based Health Monitoring
- Each log generator (`endpoints`, `firewall`, `suricata`) POSTs `event_type="keepalive"` to `/api/ingest` every 5 minutes via a background thread
- GLPI health is determined by a real-time HTTP request from the backend to `glpi-crm/apirest.php/initSession` (HTTP 401 = up, exception = down)
- Heartbeats are stored in the events table but excluded from all dashboard stats, charts, heatmap, realtime WebSocket feed, and endpoint metrics — they are pipeline health signals only
- `GET /api/dashboard/source-details` returns `last_keepalive_at` (ISO string + `Z` suffix) per source alongside security event stats

### Events Filter Cleanup
- Removed 3 fake sources from Events page filter dropdown: Network, Email, Active Directory
- Dropdown now shows only real sources: All Sources, Firewall, IDS, Endpoint, Application

### Light Theme Fixes
- Added CSS overrides for Tailwind opacity variants used by ActivityHeatmap V3:
  `bg-slate-900/50`, `bg-slate-800/60`, `bg-slate-800/50`, `bg-slate-800/40`, `border-slate-800/80`
- Pattern: `[data-theme="light"] .bg-slate-900\/50 { ... }` (escaped backslash in CSS selector)

---

## AI Triage Assistant (v1.8)

### Automated Triage Brief Generation
When an incident is created, a background Celery task automatically:
1. Extracts up to 3 unique non-private source IPs from linked events
2. Enriches each IP in parallel via VirusTotal + AbuseIPDB (skips on error/no key)
3. Calls Qwen2.5:1.5B via local Ollama to generate a structured JSON brief
4. Retries with a stricter prompt if the LLM returns non-JSON
5. Emits a `triage_update` WebSocket event when ready (or failed)

### TriageBriefPanel Component
Mounted in the Incident detail panel — shows the brief as it progresses:
- **Pending/Generating**: pulsing spinner + "Generating triage brief…" message
- **Ready**: confidence meter (green ≥70%, amber 40–69%, red <40%), threat hypothesis, MITRE tactic chips (clickable → attack.mitre.org), recommended action, generation footer (model + seconds)
- **Failed**: error message + Regenerate button
- **Analyst actions**: Accept ✓ / Edit ✏ / Dismiss ✗ — recorded with reviewer name + timestamp
- **Edit mode**: in-line textarea for analyst notes; saves to backend via PATCH

### State Machine
```
POST /incidents → [PENDING] → [GENERATING] → [READY] → [ACCEPTED/EDITED/DISMISSED]
                                          └──────────── [FAILED] ──→ Regenerate
```

### Backend
- `triage_briefs` PostgreSQL table (UUID PK, JSONB for mitre_tactics + ip_enrichment)
- `GET /api/triage-briefs?incident_id=` — most recent brief for an incident
- `PATCH /api/triage-briefs/:id` — accept / edit (with notes) / dismiss
- `POST /api/incidents/:id/retriage` — trigger a new brief (409 if already in-flight)
- `POST /api/incidents` — create incident + auto-fire triage
- Pure service layer (`triage_service.py`) — `extract_ips`, `enrich_ips` (ThreadPoolExecutor), `build_triage_prompt`, `parse_llm_response`
- Prompt injection mitigation: log data wrapped in `[UNTRUSTED LOG DATA]` delimiter
- Ollama retry: 3× on ConnectionError with 2s/4s/8s backoff

### Infrastructure
- `soc-ollama` Docker service (`ollama/ollama:latest`, port 11434, `ollama_data` volume)
- Config: `OLLAMA_URL`, `OLLAMA_MODEL` (default `qwen2.5:1.5b`), `VT_API_KEY`, `ABUSEIPDB_API_KEY`

### Tests
- 32 unit tests (`tests/unit/test_triage_service.py`) — service pure functions
- 22 integration tests (`tests/integration/test_triage_task.py`) — task pipeline + API routes

---

## Raw Log Explainer (v1.9.1)

"Explain this log" button in the Event detail panel. One click calls the local LLM synchronously
and renders a plain-English explanation inline — no Celery, no DB write, no new table.

### How it works
```
User clicks "Explain this log"
       │
       └──► POST /api/events/:id/explain   (sync, timeout 30s)
                    │
                    ├── fetch event.raw_log + source + event_type
                    ├── build_explain_prompt() — [UNTRUSTED LOG DATA] wrapper
                    ├── POST http://ollama:11434/api/chat
                    └── return {"explanation": "plain English text"}
```

### Prompt injection protection
Raw log content is wrapped in `[UNTRUSTED LOG DATA]` / `[END UNTRUSTED LOG DATA]` delimiters
(same pattern as the triage brief). If a log line contains "Ignore all previous instructions…",
the model is instructed to treat that section as untrusted data, not as a directive.

### UI
- **Trigger**: "🪄 Explain this log" button appears below the raw_log block when an event has log content
- **Loading**: button becomes "Explaining…" spinner while waiting (~4s)
- **Result**: violet left-border callout box: `AI: An inbound TCP SYN packet from…`
- **Reset**: explanation clears automatically when switching to a different event

### Backend
- `POST /api/events/:id/explain` — 15 lines in `events.py`; 503 on Ollama down, 504 on timeout
- `build_explain_prompt()` in `triage_service.py` — truncates raw_log to 1000 chars
- Falls back to `event.description` when `raw_log` is null; returns 400 if neither exists

### Tests
- 3 unit tests (`tests/unit/test_triage_service.py`) — prompt includes source/type/log, truncation, fallback
- 5 integration tests (`tests/integration/test_explain_endpoint.py`) — 200, 400, 404, 503, 504

---

## Planned Features (Roadmap)

### v1.9 (Planned)
- [ ] IP Reputation Card — collapsible VT/AbuseIPDB scores panel in TriageBriefPanel (TODOS.md T1)
- [ ] Playbook Suggestion Chip — MITRE→PlaybookCategory matching in TriageBriefPanel (TODOS.md T2)
- [ ] Email notifications (SMTP integration)
- [ ] Webhook notifications
- [ ] Geolocation map for source IPs

### v2.0 (Planned)
- [ ] Mobile responsive design
- [ ] API rate limiting

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| v1.0 | 2025-01 | Initial release: Dashboard, Events, Alerts, Sites, Multi-site support |
| v1.1 | 2026-01 | Authentication, Themes, Export, Enhanced Playbooks, Rule templates, RBAC |
| v1.2 | 2026-02 | GLPI integration, Infrastructure lab (Wazuh + endpoints + firewall), Event Correlation Engine, Incidents module |
| v1.3 | 2026-02 | Automated backend testing (pytest), Automated playbook execution runner |
| v1.4 | 2026-02 | Dashboard analytics: trend indicators, severity trend chart, activity heatmap, top source IPs, quick actions, live feed animation |
| v1.5 | 2026-02 | SOC analyst UX: language consistency, trend color fix, alert grouping, FP quick action, IP OSINT actions, playbook integration |
| v1.6 | 2026-02 | Internationalization: EN/FR language toggle with full translation coverage |
| v1.7 | 2026-02 | Suricata IDS (4th source), ActivityHeatmap V3 (date-based, severity breakdown, click-to-filter), StatCard Mission Critical (sparklines, statusColor), light theme opacity fixes, Sources Health Panel, heartbeat-based health monitoring |
| v1.8 | 2026-03 | AI Triage Assistant: TriageBrief model, Celery pipeline, IP enrichment (VT+AbuseIPDB), Ollama LLM, TriageBriefPanel with confidence meter + MITRE chips + accept/edit/dismiss |
| v1.9.1 | 2026-03 | Raw Log Explainer: "Explain this log" button on every event, sync LLM call, [UNTRUSTED LOG DATA] prompt injection protection |
