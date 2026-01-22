# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AudioSOC** - External SOC (Security Operations Center) dashboard for a network of 30 audioprothésiste (hearing aid) centers in France. This is an M2 Cybersecurity Master's project at PSB Paris School of Business.

### Business Context
- Client: Network of ~30 hearing aid centers across France
- Need: Centralized security monitoring (no internal security team)
- Goal: Functional demo platform, documented, industrializable

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Tailwind CSS, Recharts, Socket.IO Client |
| Backend | Python 3.11, Flask, SQLAlchemy, Flask-SocketIO |
| Database | PostgreSQL 15 |
| Task Queue | Celery + Redis |
| Containers | Docker, Docker Compose |

## Commands

### Start all services
```bash
docker compose up -d
```

### Initialize database (first time)
```bash
docker compose exec backend python -c "from app import create_app, db, init_demo_users; app = create_app(); app.app_context().push(); db.create_all(); init_demo_users()"
```

### Demo credentials
| User | Password | Role |
|------|----------|------|
| admin | admin123 | Administrator |
| analyst | analyst123 | SOC Analyst |
| supervisor | supervisor123 | Supervisor |

### Generate test events
```bash
python scripts/log_generator.py --count 50        # Generate 50 events
python scripts/log_generator.py --attack          # Simulate attack scenario
python scripts/log_generator.py --burst           # Burst mode (simulates attack spikes)
python scripts/log_generator.py --backfill        # Backfill 1000 events over 7 days
python scripts/log_generator.py --backfill --days 30 --count 2000  # Custom backfill
```

### Check logs
```bash
docker compose logs backend --tail=50
docker compose logs frontend --tail=50
```

### Restart after code changes
```bash
docker compose restart backend                    # Backend only
docker compose down && docker compose up -d       # Full restart
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend (React)                             │
│  Dashboard │ Events │ Alerts │ Playbooks │ Sites                │
│  Port: 3000                                                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │ REST API + WebSocket
┌──────────────────────────┴──────────────────────────────────────┐
│                     Backend (Flask)                              │
│  /api/events │ /api/ingest │ /api/dashboard │ /api/alerts       │
│  Port: 5000                                                      │
└───────┬─────────────────┬─────────────────┬─────────────────────┘
        │                 │                 │
   PostgreSQL          Redis           Celery
   Port: 5432       Port: 6379      (Alert Engine)
```

## Project Structure

```
Claude SOC project/
├── backend/
│   ├── app/
│   │   ├── models/          # SQLAlchemy models (Event, AlertRule, User)
│   │   ├── routes/          # API endpoints (events, ingest, dashboard, alerts)
│   │   └── services/        # Business logic (alert_engine, websocket, notifications)
│   ├── config.py            # Flask configuration
│   ├── celery_app.py        # Celery configuration
│   └── run.py               # Entry point
├── frontend/
│   ├── src/
│   │   ├── components/      # Reusable UI (StatCard, TopBar, Charts, etc.)
│   │   ├── pages/           # Page components (Dashboard, Events, Alerts, etc.)
│   │   ├── hooks/           # Custom hooks (useSocket)
│   │   ├── api.ts           # API client functions
│   │   └── types.ts         # TypeScript interfaces
│   └── tailwind.config.js
├── scripts/
│   ├── log_generator.py     # Generates realistic security events
│   └── init_db.py           # Database initialization
├── docs/
│   ├── architecture.md      # Detailed architecture
│   └── project_status.md    # Current progress
└── docker-compose.yml
```

## API Endpoints

### Events
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events` | List events (supports `severity=critical,high`, `status=new,investigating`, `limit=N`) |
| GET | `/api/events/:id` | Get single event |
| POST | `/api/ingest` | Ingest new event |
| PATCH | `/api/events/:id/status` | Update event status |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats` | Statistics (by_severity, by_source, by_status) |
| GET | `/api/dashboard/trends?timeframe=24h` | Event trends (supports: 5m, 15m, 30m, 1h, 6h, 24h, 7d, 30d) |
| GET | `/api/dashboard/sites` | Summary by site |

### Alert Rules
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/alerts/rules` | List all rules |
| POST | `/api/alerts/rules` | Create rule |
| PATCH | `/api/alerts/rules/:id` | Update rule |
| DELETE | `/api/alerts/rules/:id` | Delete rule |

## Data Models

### Event Sources (monitored systems)
- `firewall` - Network firewalls per center
- `ids` - Intrusion Detection Systems
- `endpoint` - Workstations (audioprothésiste PCs)
- `active_directory` - AD authentication
- `email` - Email gateway (phishing, spam)
- `application` - CRM, patient records
- `network` - Network traffic analysis

### Severity Levels
- `critical` - Active breach, ransomware (RED)
- `high` - Multiple failed logins, port scans (ORANGE)
- `medium` - Unusual traffic, config changes (YELLOW)
- `low` - Informational events (BLUE)

### Event Status Flow
```
new → investigating → resolved
         ↓
    false_positive
```

## Code Patterns

### Frontend
- Use functional components with hooks (no class components)
- Mock data fallback for demo mode (see `generateMockHourlyData()` in Dashboard.tsx)
- Glass card styling: use `glass-card` CSS class
- Severity badges: use `badge-critical`, `badge-high`, etc.

### Backend
- All routes return JSON with consistent structure
- Multi-value filters supported: `?severity=critical,high`
- WebSocket broadcasts on event ingestion
- Sanitize raw logs before storage (prevent injection)

## Known Issues / TODOs

### TypeScript Warnings (non-blocking)
- Unused imports in `Events.tsx`, `Playbooks.tsx`, `AlertsBySourceChart.tsx`
- These are warnings only; app runs fine

### Implemented Features (v1.1)
- [x] JWT Authentication (login, register, roles: admin/analyst/supervisor)
- [x] Dark/Light theme toggle
- [x] Export functionality (CSV, PDF, JSON)
- [x] Enhanced Playbooks with step execution
- [x] Event Volume timeframes (5m, 15m, 30m, 1h, 6h, 24h, 7d, 30d)
- [x] Historical data backfill (`--backfill` option)

### Not Yet Implemented
- [ ] Email/Webhook notifications (configured but not connected)
- [ ] Real SIEM integration (Wazuh/ELK)

## Environment

### URLs (development)
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- Health check: http://localhost:5000/health

### Docker Services
- `soc-db` - PostgreSQL
- `soc-redis` - Redis
- `soc-backend` - Flask API
- `soc-frontend` - React dev server
- `soc-celery-worker` - Celery worker
- `soc-celery-beat` - Celery scheduler
