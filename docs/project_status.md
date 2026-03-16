# Project Status

## Current Milestone: Version 1.2 - COMPLETED

### Completed ✓

#### Core Features (V1)
- [x] Project structure and documentation
- [x] Database schema (SQLAlchemy models: Event, AlertRule, User, Playbook, PlaybookExecution)
- [x] Event ingestion API (POST /api/ingest, batch support)
- [x] REST API routes (events, dashboard, alerts, playbooks)
- [x] WebSocket server (real-time event streaming)
- [x] Celery alert engine (periodic rule evaluation)
- [x] Frontend React dashboard
- [x] Events list with filtering and search
- [x] Status updates and event triage
- [x] Alert rules management
- [x] Sites overview page
- [x] Docker configuration (docker-compose.yml)
- [x] Log generator for demo (30 sites simulation)

#### V1.1 Features
- [x] JWT Authentication (login, register, roles: admin/analyst/supervisor)
- [x] Dark/Light theme toggle
- [x] Export functionality (CSV, PDF, JSON) with html2pdf.js
- [x] Enhanced Playbooks with execution tracking
  - Playbook CRUD (create, duplicate, archive, toggle)
  - PlaybookExecution model for tracking runs
  - Active Executions widget
  - Execution history per playbook
  - Step-by-step progress with complete/skip
- [x] Event Volume timeframes (5m, 15m, 30m, 1h, 6h, 24h, 7d, 30d)
- [x] Historical data backfill (`--backfill` option in log_generator.py)

---

## Before / After — Incident Correlation Engine (v1.2)

### Before (v1.1)
The alert engine (`alert_engine.py`) was a **fire-and-forget rule evaluator**:
- Checked each `AlertRule` every 10 seconds against recent events
- If threshold met → incremented `trigger_count`, set `last_triggered` on the rule, logged a message
- Every matching event remained **isolated** — no grouping, no lifecycle, no ownership
- No way to track "this cluster of 12 failed-login events is one ongoing attack"
- Analysts had to manually search Events page to understand what triggered an alert

### After (v1.2)
The alert engine is now a **full correlation engine**:
- When a rule fires → creates (or reopens) an **Incident** record linked to that rule
- Matching unassigned events are **bulk-assigned** to the incident via `incident_id` FK
- Open incident per rule is **reused** — no duplicate incidents for the same ongoing attack
- Incidents have their own **status lifecycle**: `new → open → investigating → resolved / false_positive`
- Analysts get an **Incidents page**: grouped view, detail panel showing all N linked events, assign-to-me, status transitions
- Traceability: `incident.alert_rule_id` always shows which rule triggered it

### Net Impact
| Dimension | Before | After |
|-----------|--------|-------|
| Event grouping | None | Automatic via alert rule |
| Analyst workflow | Search events manually | Open Incidents page, see context immediately |
| Attack traceability | `trigger_count` number only | Full incident with linked events + rule |
| Deduplication | N/A | Open incident reused per rule (no noise) |
| Schema | Events table only | + `incidents` table + `event.incident_id` FK |
| API surface | No incident endpoints | `GET/PATCH /api/incidents` |

---

#### V1.2 Features
- [x] **Event Correlation Engine** — Celery alert engine now creates `Incident` records when alert rules fire
  - New `Incident` SQLAlchemy model (UUID PK, title, severity, status, alert_rule FK, assigned_to, resolved_at)
  - Events linked to incidents via `incident_id` FK on events table (SET NULL on delete)
  - Deduplication: unassigned events only; open incident per rule reused (no duplicates)
  - Bulk UPDATE for event assignment (performance)
  - Default 1h timeframe window when rule has no explicit timeframe
- [x] **Incidents page** (React) — full list/grid view with detail side panel
  - Filters: severity, status, full-text search (client-side on title/description)
  - Status transitions: new → open → investigating → resolved / false_positive
  - Assign to me / Unassign button
  - Associated events list in detail panel
  - Paginated API (`GET /api/incidents`, `GET /api/incidents/:id`, `PATCH /api/incidents/:id`)
- [x] **Safe schema migration** (`migrate_db.py`) — `db.create_all()` + idempotent `ALTER TABLE` on startup; no Alembic dependency
- [x] **Custom dropdown component** (`CustomSelect.tsx`) — replaces native `<select>` across Events and Incidents pages; fully theme-aware (CSS variables), works in both dark/light mode
- [x] **Real infrastructure only** — log generator constrained to `endpoint-pc-01`, `endpoint-pc-02`, `firewall-gw`, `glpi-crm`; fake AUDIO_* site data removed from DB
- [x] **pytest suite** — backend test coverage for events, alert rules, dashboard, playbook runner

---

## Current Milestone: Version 1.4 — Dashboard Analytics & UX — COMPLETED

### Completed ✓

#### v1.3 Features
- [x] **Automated backend testing** — pytest suite covering events, alert rules, dashboard, playbook runner
- [x] **Automated playbook execution runner** — Celery-driven step execution

#### v1.4 Features (Dashboard Analytics & UX)
- [x] **Trend indicators on StatCards** — % change vs previous 24h for Security Events and Critical Alerts
  - Backend: `events_prev_24h`, `critical_prev_24h` added to `/dashboard/stats`
- [x] **Severity Trend Chart** — stacked area chart (daily breakdown by severity) for 7d/30d ranges
  - Component: `SeverityTrendChart.tsx`; backend: `daily` array in `/dashboard/trends`
- [x] **Activity Heatmap** — 7-day × 24-hour event density heatmap
  - Component: `ActivityHeatmap.tsx`; backend: `GET /api/dashboard/heatmap`
- [x] **Top Source IPs widget** — top 10 IPs with severity-colored bars
  - Component: `TopSourceIPs.tsx`; backend: `GET /api/dashboard/top-ips` (JSONB query)
- [x] **Quick Actions column** in RecentAlertsTable — Eye (view) + UserCheck (assign to me)
- [x] **Alert Detail Modal — toggleable Quick Actions** — Create Ticket, Block IP, Isolate Endpoint, Run Playbook (instant feedback, re-clickable)
- [x] **Degraded endpoint sub-text** — EndpointStatusCard shows reason for degraded/offline status
- [x] **Live feed animation** — new alert rows flash blue highlight then fade (`animate-new-entry`)
- [x] **Live mode toggle** — LIVE/Paused button with 10s auto-refresh
- [x] **Interactive donut chart** — click source slice to filter alerts table

---

## Current Milestone: Version 1.5 — SOC Analyst UX Improvements — COMPLETED (superseded by v1.6)

### Completed ✓

#### v1.5 Features (SOC Analyst Feedback)
- [x] **Language consistency** — All UI strings standardized to English (previously mixed French/English)
- [x] **Event trend color fix** — More events = red (bad), fewer = green (good); amber for >50%, red for >100%
- [x] **Alert grouping** — Duplicate alerts grouped by name+source in Recent Alerts table with count badge
- [x] **False Positive quick action** — Ban icon in table actions column for one-click FP marking
- [x] **IP Quick Actions (OSINT)** — Hover menu on Top Source IPs: Whois, VirusTotal, Block IP
- [x] **Playbook integration** — Real playbook picker in Alert Detail Modal with Recommended badges

---

## Current Milestone: Version 1.6 — Internationalization (EN/FR) — COMPLETED

### Completed ✓

#### v1.6 Features (i18n)
- [x] **EN/FR language toggle** — One-click toggle button in top header bar (🇬🇧 EN / 🇫🇷 FR)
- [x] **LanguageContext provider** — Lightweight i18n system (no external library), same pattern as ThemeContext
- [x] **Translations dictionary** — ~150 keys per language in `frontend/src/i18n/translations.ts`
- [x] **Full component coverage** — All dashboard-facing components use `t()` for user-visible strings
- [x] **Locale-aware formatting** — Dates/numbers formatted with `locale()` helper (`en-US` / `fr-FR`)
- [x] **localStorage persistence** — Language preference survives page refresh

---

## Current Milestone: Version 1.7 — Dashboard V3 & Suricata IDS — COMPLETED

### Completed ✓

#### Suricata IDS (4th event source)
- [x] **Suricata container** — Ubuntu 22.04 + Suricata (OISF PPA) + Wazuh agent 4.14.2 on `dmz-net`
- [x] **EVE JSON generator** — Realistic Suricata alerts (ET OPEN signatures), DNS, HTTP, TLS events
- [x] **Wazuh integration** — `log_format: json` on `/var/log/suricata/eve.json`; custom rules 100200-100202
- [x] **Frontend** — Source `ids` mapped to purple `#8b5cf6`, displayed as `IDS / Suricata`
- [x] **Events filter** — Fake sources removed; now shows only 4 real sources (Firewall, IDS, Endpoint, Application)

#### ActivityHeatmap V3
- [x] **Date-based grid** — Real calendar dates for last 7 or 30 days × 24 hours (replaces day-of-week aggregation)
- [x] **Severity breakdown** — Critical / High / Med-Low counts in hover tooltip per cell
- [x] **7d / 30d toggle** — Switch view; backend `GET /api/dashboard/heatmap?days=N` (default 30)
- [x] **Click-to-filter** — Click a cell to filter Recent Alerts to that time slice
- [x] **Full i18n** — All labels translated via `t()` with `heatmap.*` keys (EN + FR)
- [x] **Light theme** — Added CSS overrides for opacity variants (`bg-slate-900/50`, `bg-slate-800/40|50|60`, `border-slate-800/80`)

#### StatCard Mission Critical Redesign
- [x] **Sparkline SVG** — Trend sparkline rendered behind value at 20% opacity (`sparklineData?: number[]` prop)
- [x] **statusColor** — `normal | success | warning | critical` drives icon color, card tint, border hover
- [x] **subValue** — Secondary metric line below main value

### In Progress 🚧
None

### Not Yet Implemented
- [ ] Email notification integration
- [ ] Webhook notifications

### Blocked ⛔
None

---

## Current Milestone: Version 1.8 — AI Triage Assistant — COMPLETED

### Completed ✓

#### AI Triage Assistant (v1.8)
- [x] **TriageBrief model** — `triage_briefs` table (UUID PK, JSONB mitre_tactics + ip_enrichment, 7-state enum, analyst fields)
- [x] **Celery task** (`tasks_triage.py`) — PENDING → GENERATING → READY/FAILED pipeline with retry logic
- [x] **IP enrichment** — VT + AbuseIPDB in parallel via `ThreadPoolExecutor(max_workers=6)`; `ipaddress.ip_address().is_private` for RFC-1918 filtering
- [x] **LLM integration** — Ollama POST `/api/chat` with 3× ConnectionError retry (2s/4s/8s backoff); strict-prompt retry on JSON parse failure
- [x] **Prompt injection mitigation** — `[UNTRUSTED LOG DATA]` delimiter in prompt template
- [x] **API routes** (`routes/triage.py`) — GET brief by incident_id, PATCH accept/edit/dismiss, POST retriage (409 if in-flight)
- [x] **POST /api/incidents** — create incident + auto-fire triage brief generation
- [x] **WebSocket** — `triage_update` event emitted on brief completion/failure
- [x] **TriageBriefPanel.tsx** — confidence meter, MITRE chips (→ attack.mitre.org), analyst actions, edit mode, generation footer, regenerate button; WebSocket live updates
- [x] **Docker** — `soc-ollama` service + `ollama_data` volume in `docker-compose.yml`
- [x] **Tests** — 32 unit tests (service) + 22 integration tests (task + routes), all passing


---

## Current Milestone: Version 1.9.1 — Raw Log Explainer — COMPLETED

### Completed ✓

- [x] **`build_explain_prompt()`** in `triage_service.py` — `[UNTRUSTED LOG DATA]` wrapper, 1000-char truncation, fallback to description
- [x] **`POST /api/events/:id/explain`** — sync Ollama call (30s timeout), typed 503/504 error responses
- [x] **Frontend** — "Explain this log" button in Event detail panel, spinner, violet AI callout box, state reset on event switch
- [x] **Tests** — 3 unit + 5 integration (200, 400, 404, 503, 504), all passing

---

## Session Notes
- 2026-01-14: Project initialized with PSB methodology. Created documentation files.
- 2026-01-14: **V1 MVP COMPLETED** - Full stack implementation with backend (Flask), frontend (React), database (PostgreSQL), task queue (Celery/Redis), Docker deployment, and log generator for 30 audioprothésiste sites.
- 2026-02-04: **V1.1 COMPLETED** - Added JWT auth, theme toggle, export (CSV/PDF/JSON), playbooks backend with execution tracking, event volume timeframes, backfill option.
- 2026-02-05: PDF export improved with html2pdf.js for direct download + better styling.
- 2026-02-24: **V1.2 COMPLETED** — Event Correlation Engine (Incident model, migration, alert engine refactor), Incidents page (React), safe schema migration, CustomSelect component, log generator constrained to real infra (endpoint-pc-01/02, firewall-gw), pytest suite added.
- 2026-02-26: **V1.4 COMPLETED** — Dashboard analytics: trend indicators (% change), severity trend chart, activity heatmap, top source IPs widget, quick actions (table + modal), degraded endpoint tooltips, live feed animation, interactive donut chart.
- 2026-02-26: **V1.5 COMPLETED** — SOC analyst UX: language consistency (full English), trend color fix, alert grouping, FP quick action, IP OSINT actions (Whois/VT/Block), playbook integration on alerts.
- 2026-02-27: **V1.6 COMPLETED** — Internationalization: EN/FR language toggle in header, LanguageContext provider, translations dictionary (~150 keys), full component coverage, locale-aware formatting, localStorage persistence.
- 2026-03-16: **V1.9.1 COMPLETED** — Raw Log Explainer: sync LLM endpoint on events, [UNTRUSTED LOG DATA] prompt injection protection, 8 new tests passing.
- 2026-03-14: **V1.8 COMPLETED** — AI Triage Assistant: TriageBrief model + Celery task (VT/AbuseIPDB enrichment + Ollama LLM), TriageBriefPanel React component (confidence meter, MITRE chips, accept/edit/dismiss), Ollama Docker service, 54 new tests all passing.
- 2026-02-28: **V1.7 COMPLETED** — Suricata IDS as 4th event source, ActivityHeatmap V3 (date-based grid, severity breakdown, click-to-filter, 7d/30d toggle), StatCard Mission Critical redesign (sparklines, statusColor, subValue), Events filter cleanup, light theme opacity variant fixes. Branch `fill-spaceV3` merged into master.
