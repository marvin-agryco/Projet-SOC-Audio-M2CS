#!/bin/bash
set -e

# Fix resolv.conf duplication (Docker writes it once per attached network)
awk '!seen[$0]++' /etc/resolv.conf > /tmp/resolv.tmp && cat /tmp/resolv.tmp > /etc/resolv.conf

# Configure Wazuh agent manager address
if [ -n "$WAZUH_MANAGER" ]; then
    sed -i "s/MANAGER_IP/$WAZUH_MANAGER/" /var/ossec/etc/ossec.conf
fi

mkdir -p /var/log/suricata

# Add Suricata EVE JSON monitoring to Wazuh agent config
sed -i '/<\/ossec_config>/i \
  <localfile>\
    <log_format>json</log_format>\
    <location>/var/log/suricata/eve.json</location>\
  </localfile>' /var/ossec/etc/ossec.conf

# Start rsyslog (imklog disabled in Dockerfile)
rsyslogd

# Start Wazuh agent
/var/ossec/bin/wazuh-control start

echo "[*] Wazuh agent started, connecting to $WAZUH_MANAGER"
echo "[*] Suricata IDS: $ENDPOINT_NAME | Site: $SITE_ID"

# Start EVE JSON log generator (simulates Suricata alerts since real packet
# capture is limited in Docker/WSL2 without host networking)
python3 /opt/eve-generator.py &

echo "[*] EVE JSON generator started"

# Keep container alive
tail -f /var/log/suricata/eve.json /var/ossec/logs/ossec.log 2>/dev/null || \
    tail -f /var/ossec/logs/ossec.log
