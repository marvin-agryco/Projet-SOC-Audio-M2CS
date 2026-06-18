# Simulated Infrastructure

Simulated audioprothésiste site infrastructure for the SOC dashboard.

## Architecture

```
endpoint-1 ──┐
endpoint-2 ──┤── Wazuh Agents ──→ Wazuh Manager ──→ SOC Dashboard
GLPI ────────┘                         │
                                  Wazuh Dashboard
                                  (https://localhost:4443)
```

## Quick Start

### Prerequisites
- SOC dashboard running (`docker compose up -d` in root directory)
- `vm.max_map_count` set (required by Wazuh Indexer):
  ```bash
  sudo sysctl -w vm.max_map_count=262144
  ```

### 1. Generate SSL certificates
```bash
cd infrastructure/
docker compose -f generate-certs.yml run --rm generator
```

### 2. Start infrastructure
```bash
docker compose up -d
```

### 3. Verify
- Wazuh Dashboard: https://localhost:4443 (admin / SecretPassword)
- GLPI: http://localhost:8080
- SOC Dashboard: http://localhost:3000 (events should start appearing)

## Components

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| wazuh-manager | wazuh/wazuh-manager:4.14.2 | 1514, 55000 | SIEM manager |
| wazuh-indexer | wazuh/wazuh-indexer:4.14.2 | 9200 | Log indexing |
| wazuh-dashboard | wazuh/wazuh-dashboard:4.14.2 | 4443 | Wazuh web UI |
| endpoint-1 | custom (Ubuntu + Wazuh agent) | - | Simulated PC |
| endpoint-2 | custom (Ubuntu + Wazuh agent) | - | Simulated PC |
| glpi | diouxx/glpi | 8080 | CRM system |
| glpi-db | mariadb:10.11 | - | GLPI database |

## How It Works

1. **Endpoints** generate realistic security logs (failed logins, sudo, file changes, suspicious processes)
2. **Wazuh agents** on endpoints detect and forward events to **Wazuh Manager**
3. **Wazuh Manager** processes alerts and triggers the **custom-soc integration**
4. **Integration script** transforms Wazuh alerts to SOC format and POSTs to `/api/ingest`
5. **SOC Dashboard** displays events in real-time via WebSocket

## Verifying the Setup

### Check agent connectivity
```bash
docker exec infrastructure-wazuh-manager-1 /var/ossec/bin/agent_control -l
# Expected: endpoint-pc-01 and endpoint-pc-02 with status "Active"
```

### Check events are flowing to the SOC
```bash
curl -s http://localhost:5000/api/dashboard/stats | python3 -m json.tool
# Expected: total_events > 0, total_sites >= 2
```

Events should appear in the SOC dashboard within 1-2 minutes of starting the infrastructure.

## GLPI Configuration (Optional)

GLPI enriches security events with IT asset inventory data.

### 1. Enable the REST API
1. Access GLPI: http://localhost:8080, login with `glpi` / `glpi`
2. **Setup > General > API**:
   - Enable REST API: **Yes**
   - Enable login with external token: **Yes**
3. Click **API clients** > open the default client
   - Set **Active**: Yes
   - Note the **App-Token**

### 2. Generate a User Token
1. **Administration > Users > glpi > Remote access keys**
2. Regenerate the API token, note the **User Token**

### 3. Configure the SOC backend
```bash
# Add to .env or directly in docker-compose.yml
GLPI_APP_TOKEN=<your_app_token>
GLPI_USER_TOKEN=<your_user_token>

# Restart the backend
docker compose restart backend
```

### 4. Verify
```bash
curl -s http://localhost:5000/api/assets
# Should return GLPI computer inventory
```

## Credentials

| Service | Username | Password |
|---------|----------|----------|
| Wazuh Dashboard | admin | SecretPassword |
| Wazuh API | wazuh-wui | MyS3cr37P450r.*- |
| GLPI | glpi | glpi |
| GLPI DB | glpi | glpi_pass |
