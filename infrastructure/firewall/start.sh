#!/bin/bash
set -e

# Fix resolv.conf duplication (Docker writes it once per attached network)
awk '!seen[$0]++' /etc/resolv.conf > /tmp/resolv.tmp && cat /tmp/resolv.tmp > /etc/resolv.conf

# Configure Wazuh agent manager address
if [ -n "$WAZUH_MANAGER" ]; then
    sed -i "s/MANAGER_IP/$WAZUH_MANAGER/" /var/ossec/etc/ossec.conf
fi

mkdir -p /var/log/firewall

# Add firewall log monitoring to Wazuh agent config
# Insert <localfile> block before closing </ossec_config> tag
sed -i '/<\/ossec_config>/i \
  <localfile>\
    <log_format>syslog</log_format>\
    <location>/var/log/firewall/iptables.log</location>\
  </localfile>' /var/ossec/etc/ossec.conf

# Start rsyslog (imklog disabled in Dockerfile - no /proc/kmsg in container)
rsyslogd

# Start Wazuh agent
/var/ossec/bin/wazuh-control start

echo "[*] Wazuh agent started, connecting to $WAZUH_MANAGER"
echo "[*] Firewall: $ENDPOINT_NAME | Site: $SITE_ID"

# Wait for Docker to finish assigning IPs to all interfaces
sleep 5

# --- Detect interfaces (strip @ifN suffix that Docker adds to veth names) ---
EXTERNAL_IF=""
INTERNAL_IF=""
for iface in $(ip -o link show | awk '!/lo/ {print $2}' | cut -d@ -f1); do
    if ip -o -f inet addr show dev "$iface" 2>/dev/null | grep -q "172\.25\."; then
        EXTERNAL_IF="$iface"
    else
        INTERNAL_IF="$iface"
    fi
done
INTERNAL_SUBNET=$(ip -o -f inet addr show dev "$INTERNAL_IF" 2>/dev/null | awk '{print $4}')

echo "[*] External (DMZ)   interface : $EXTERNAL_IF"
echo "[*] Internal (infra) interface : $INTERNAL_IF  subnet: $INTERNAL_SUBNET"

if [ -z "$EXTERNAL_IF" ] || [ -z "$INTERNAL_IF" ] || [ -z "$INTERNAL_SUBNET" ]; then
    echo "[!] Interface detection failed - skipping iptables setup"
else
    # --- iptables rules ---
    # Flush filter chains
    iptables -F
    iptables -X

    # Flush only PREROUTING and POSTROUTING in nat table.
    # Do NOT flush nat OUTPUT: Docker uses it for DNS (127.0.0.11:53) interception.
    iptables -t nat -F PREROUTING
    iptables -t nat -F POSTROUTING

    iptables -P FORWARD DROP
    iptables -P INPUT  ACCEPT
    iptables -P OUTPUT ACCEPT

    # Logging chain: rate-limited log then drop
    iptables -N LOGGING
    iptables -A LOGGING -m limit --limit 10/min -j LOG --log-prefix "IPTables-Dropped: " --log-level 4
    iptables -A LOGGING -j DROP

    # Allow established/related
    iptables -A FORWARD -m state --state ESTABLISHED,RELATED -j ACCEPT

    # NAT: masquerade internal -> external
    iptables -t nat -A POSTROUTING -s "$INTERNAL_SUBNET" -o "$EXTERNAL_IF" -j MASQUERADE

    # Allow internal -> external
    iptables -A FORWARD -i "$INTERNAL_IF" -o "$EXTERNAL_IF" -j ACCEPT

    # Log and drop unsolicited inbound (DMZ -> internal)
    iptables -A FORWARD -i "$EXTERNAL_IF" -o "$INTERNAL_IF" -j LOGGING

    echo "[*] Firewall rules applied"
    iptables -L -v -n
fi

# Start log generator (realistic iptables log entries since /proc/kmsg is unavailable in container)
python3 /opt/log-generator.py &

# Keep container alive
tail -f /var/log/firewall/iptables.log /var/ossec/logs/ossec.log 2>/dev/null || \
    tail -f /var/ossec/logs/ossec.log
