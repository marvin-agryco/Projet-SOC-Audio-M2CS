#!/bin/bash
set -e

# Configure Wazuh agent
if [ -n "$WAZUH_MANAGER" ]; then
    sed -i "s/MANAGER_IP/$WAZUH_MANAGER/" /var/ossec/etc/ossec.conf
fi

# Start rsyslog for system logging (clean up stale PID file from previous run)
rm -f /run/rsyslogd.pid
rsyslogd

# Start Wazuh agent
/var/ossec/bin/wazuh-control start

echo "[*] Wazuh agent started, connecting to $WAZUH_MANAGER"
echo "[*] Endpoint: $ENDPOINT_NAME | Site: $SITE_ID"

# Wait for agent to register
sleep 10

# Start log generator in background
python3 /opt/log-generator.py &

# Keep container running and tail agent log
tail -f /var/ossec/logs/ossec.log
