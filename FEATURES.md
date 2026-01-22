# FEATURES.md

This file tracks all features implemented in the AudioSOC project.

---

## Core Platform Features

### Dashboard (v1.0)
- Real-time security event monitoring via WebSocket
- KPI cards showing event counts by severity
- Event Volume chart with configurable timeframes: 5m, 15m, 30m, 1h, 6h, 24h, 7d, 30d
- Critical events list with quick access
- Site summary overview (30 centers)
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
- 30 audioprothésiste center support
- Per-site event filtering
- Site summary statistics
- Site-based WebSocket subscriptions

### Event Ingestion (v1.0)
- REST API for event submission (`POST /api/ingest`)
- Batch ingestion (`POST /api/ingest/batch`)
- Input validation and sanitization
- Real-time WebSocket broadcast on ingestion
- Support for 7 event sources: firewall, ids, endpoint, active_directory, email, application, network

---

## Authentication & Authorization (v1.1)

### JWT Authentication
- Login/logout with JWT tokens
- Token refresh mechanism
- 24-hour token expiration
- Secure password hashing (bcrypt)

### User Roles
- **Admin**: Full system access
- **Analyst**: Event triage and investigation
- **Supervisor**: Team oversight and reporting

### Demo Users
- Pre-configured demo accounts for testing
- Quick-fill credentials on login page

### Frontend Integration
- AuthContext for state management
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
- Custom column selection
- Proper data escaping

### PDF Reports
- Browser-based PDF generation
- Styled report layout with AudioSOC branding
- Statistics summary
- Event table with severity badges

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
- 6-service Docker Compose setup
- Health checks configured
- Environment variable configuration
- Production-ready with Gunicorn

---

## Planned Features (Roadmap)

### v1.2 (Planned)
- [ ] Email notifications (SMTP integration)
- [ ] Webhook notifications
- [ ] Advanced analytics dashboard
- [ ] Event correlation

### v2.0 (Planned)
- [ ] Real SIEM integration (Wazuh/ELK)
- [ ] Automated playbook execution
- [ ] Machine learning anomaly detection
- [ ] Mobile responsive design
- [ ] API rate limiting

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| v1.0 | 2025-01 | Initial release: Dashboard, Events, Alerts, Sites, Multi-site support |
| v1.1 | 2026-01 | Authentication, Themes, Export, Enhanced Playbooks, Rule templates |

