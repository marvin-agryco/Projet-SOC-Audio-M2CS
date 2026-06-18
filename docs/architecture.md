# System Architecture

## Components

### 1. Ingestion Service (Python)
- Receives logs via `POST /api/ingest` (single) and `POST /api/ingest/batch` (multiple)
- Validates format, source, and severity
- Sanitizes raw logs to prevent injection
- Stores in PostgreSQL
- Broadcasts to WebSocket clients on ingestion — `event_type="keepalive"` heartbeats are stored but suppressed from broadcast to avoid flooding the realtime feed

### 2. REST API (Flask)
- `GET /api/events` - List events with filters (status, severity, source, site_id, search)
- `GET /api/events/:id` - Get single event details
- `PATCH /api/events/:id/status` - Update event status and assignment
- `GET /api/dashboard/stats` - Dashboard statistics (counts by status/severity/source)
- `GET /api/dashboard/trends` - 7-day trends (hourly and daily)
- `GET /api/dashboard/heatmap` - Event density by date × hour (last N days, with severity breakdown)
- `GET /api/dashboard/top-ips` - Top 10 source IPs by event count (JSONB metadata query)
- `GET /api/dashboard/source-details` - Per-source live stats: last signal, keepalive, EPS, 24h count, top event type, active sites; GLPI health via real-time HTTP check
- `GET /api/dashboard/sites` - Summary by site (endpoint-pc-01, endpoint-pc-02, firewall-gw)
- `GET /api/incidents` - List incidents (filter by severity, status, assigned_to; paginated)
- `GET /api/incidents/:id` - Get incident + up to 100 linked events
- `PATCH /api/incidents/:id` - Update status, severity, assigned_to
- `GET/POST/PATCH/DELETE /api/alerts/rules` - Alert rules CRUD

### 3. WebSocket Server (Flask-SocketIO)
- Broadcasts new events to connected clients (`new_event`)
- Pushes alert notifications in real-time (`alert`)
- Room-based subscriptions (by site, by severity)
- Connection status tracking
- Keepalive heartbeats (`event_type="keepalive"`) are excluded from all broadcasts

### 4. Alert Engine + Correlation (Celery + Redis)
- Evaluates rules every 10 seconds
- Supports threshold-based rules (count + timeframe); default window 1h when unspecified
- When a rule fires: creates or reopens an `Incident`, bulk-assigns matching events to it
- Incident deduplication: only unassigned events considered; open incident per rule is reused
- Actions: log, email, webhook
- Tracks trigger count and last triggered time

## Data Flow
```
┌────────────────┐    POST /api/ingest    ┌─────────────┐
│  Log Sources   │ ─────────────────────► │   Flask     │
│  (real infra)  │                        │   Backend   │
└────────────────┘                        └──────┬──────┘
                                                 │
                    ┌────────────────────────────┼───────────────────────────┐
                    │                            │                           │
                    ▼                            ▼                           ▼
            ┌──────────────┐            ┌──────────────┐            ┌──────────────┐
            │  PostgreSQL  │            │    Redis     │            │  WebSocket   │
            │   (Events)   │            │ (Task Queue) │            │  (Clients)   │
            └──────────────┘            └──────┬───────┘            └──────────────┘
                                               │
                                               ▼
                                       ┌──────────────┐
                                       │    Celery    │
                                       │ Alert Engine │
                                       └──────────────┘
```

## Database Schema

### Events Table
```
┌──────────────────────────────────────────────────┐
│                     events                        │
├──────────────────────────────────────────────────┤
│ id          │ UUID (PK)                          │
│ timestamp   │ TIMESTAMP                          │
│ source      │ ENUM (firewall/endpoint/application)│
│ event_type  │ VARCHAR(100)                       │
│ severity    │ ENUM (critical/high/medium/low)    │
│ description │ TEXT                               │
│ raw_log     │ TEXT                               │
│ metadata    │ JSONB                              │
│ status      │ ENUM (new/investigating/resolved)  │
│ assigned_to │ VARCHAR(100)                       │
│ site_id     │ VARCHAR(50) - endpoint-pc-01/02,   │
│             │   firewall-gw, glpi-crm            │
│ incident_id │ UUID (FK → incidents, SET NULL)    │
│ created_at  │ TIMESTAMP                          │
│ updated_at  │ TIMESTAMP                          │
└──────────────────────────────────────────────────┘
```

### Incidents Table
```
┌──────────────────────────────────────────────────┐
│                   incidents                       │
├──────────────────────────────────────────────────┤
│ id            │ UUID (PK)                        │
│ title         │ VARCHAR(200)                     │
│ description   │ TEXT                             │
│ status        │ ENUM (new/open/investigating/    │
│               │   resolved/false_positive)       │
│ severity      │ ENUM (critical/high/medium/low)  │
│ alert_rule_id │ UUID (FK → alert_rules, nullable)│
│ assigned_to   │ VARCHAR(100)                     │
│ resolved_at   │ TIMESTAMP (nullable)             │
│ created_at    │ TIMESTAMP                        │
│ updated_at    │ TIMESTAMP                        │
└──────────────────────────────────────────────────┘
```

### Alert Rules Table
```
┌──────────────────────────────────────────────────┐
│                   alert_rules                     │
├──────────────────────────────────────────────────┤
│ id            │ UUID (PK)                        │
│ name          │ VARCHAR(200)                     │
│ description   │ TEXT                             │
│ enabled       │ BOOLEAN                          │
│ condition     │ JSONB (event_type, count, etc)   │
│ action        │ ENUM (email/webhook/log)         │
│ action_config │ JSONB                            │
│ severity      │ VARCHAR(20)                      │
│ last_triggered│ TIMESTAMP                        │
│ trigger_count │ INTEGER                          │
│ created_at    │ TIMESTAMP                        │
└──────────────────────────────────────────────────┘
```

### Users Table
```
┌──────────────────────────────────────────────────┐
│                     users                         │
├──────────────────────────────────────────────────┤
│ id            │ UUID (PK)                        │
│ username      │ VARCHAR(80) UNIQUE               │
│ email         │ VARCHAR(120) UNIQUE              │
│ password_hash │ VARCHAR(128)                     │
│ role          │ ENUM (admin/analyst/supervisor)  │
│ is_active     │ BOOLEAN                          │
│ created_at    │ TIMESTAMP                        │
│ last_login    │ TIMESTAMP                        │
└──────────────────────────────────────────────────┘
```

## Directory Structure
```
SOC-Project---SDV/
├── backend/
│   ├── app/
│   │   ├── __init__.py          # Flask app factory
│   │   ├── models/
│   │   │   ├── event.py         # Event model (+ incident_id FK)
│   │   │   ├── incident.py      # Incident model (v1.2)
│   │   │   ├── alert_rule.py    # AlertRule model
│   │   │   └── user.py          # User model
│   │   ├── routes/
│   │   │   ├── events.py        # Events API
│   │   │   ├── ingest.py        # Ingestion API
│   │   │   ├── dashboard.py     # Dashboard API
│   │   │   ├── alerts.py        # Alert rules API
│   │   │   ├── incidents.py     # Incidents API (v1.2)
│   │   │   ├── playbooks.py     # Playbooks CRUD + execution
│   │   │   ├── auth.py          # JWT authentication
│   │   │   ├── assets.py        # GLPI asset proxy
│   │   │   └── endpoints.py     # Monitored endpoints
│   │   ├── services/
│   │   │   ├── websocket.py     # WebSocket handlers
│   │   │   ├── alert_engine.py  # Rule eval + incident correlation (v1.2)
│   │   │   └── notifications.py # Email/webhook
│   │   └── tasks.py             # Celery tasks
│   ├── config.py
│   ├── celery_app.py
│   ├── migrate_db.py            # Safe schema migration (v1.2)
│   ├── run.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.tsx
│   │   │   ├── EventCard.tsx
│   │   │   ├── SeverityBadge.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   └── CustomSelect.tsx # Reusable themed dropdown (v1.2)
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Events.tsx
│   │   │   ├── Alerts.tsx
│   │   │   ├── Incidents.tsx    # Incident management page (v1.2)
│   │   │   └── Sites.tsx
│   │   ├── hooks/
│   │   │   └── useSocket.tsx
│   │   ├── api.ts
│   │   ├── types.ts
│   │   └── App.tsx
│   ├── package.json
│   ├── tailwind.config.js
│   └── Dockerfile
├── scripts/
│   ├── log_generator.py         # Demo event generator
│   └── init_db.py               # Database initialization
├── infrastructure/
│   ├── docker-compose.yml      # Wazuh + endpoints + GLPI stack
│   ├── generate-certs.yml      # SSL certificate generation
│   └── README.md               # Infrastructure setup guide
├── docs/
│   ├── architecture.md
│   ├── reference.md            # Complete API reference
│   ├── FEATURES.md             # Feature inventory
│   └── project_status.md
├── docker-compose.yml
├── README.md
└── .env.example
```

## Local Development (without Docker)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Linux/Mac (venv\Scripts\activate on Windows)
pip install -r requirements.txt
cp ../.env.example .env
python run.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```
