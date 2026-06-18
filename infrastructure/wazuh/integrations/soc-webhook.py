#!/usr/bin/env python3
"""
Wazuh custom integration: forwards alerts to AudioSOC dashboard.

Wazuh calls this script for each alert matching the integration config.
It receives the alert JSON via stdin and the webhook URL as argv[3].

Usage in ossec.conf:
  <integration>
    <name>custom-soc</name>
    <hook_url>http://soc-backend:5000/api/ingest</hook_url>
    <level>3</level>
    <alert_format>json</alert_format>
  </integration>
"""
import sys
import json
import urllib.request
import urllib.error

# Wazuh passes: script_path, api_key, alert_file, hook_url
HOOK_URL = sys.argv[3] if len(sys.argv) > 3 else 'http://soc-backend:5000/api/ingest'


def map_severity(level):
    """Map Wazuh rule level (0-15) to SOC severity."""
    level = int(level)
    if level >= 12:
        return 'critical'
    elif level >= 8:
        return 'high'
    elif level >= 4:
        return 'medium'
    else:
        return 'low'


def map_source(groups, agent_name=''):
    """Map Wazuh rule groups to SOC event source."""
    groups_str = ','.join(groups) if isinstance(groups, list) else str(groups)

    if any(g in groups_str for g in ['ids', 'suricata', 'snort']):
        return 'ids'
    elif any(g in groups_str for g in ['firewall', 'iptables', 'pf']):
        return 'firewall'
    elif 'glpi' in agent_name.lower() or any(g in groups_str for g in ['web', 'apache', 'nginx', 'accesslog']):
        return 'application'
    else:
        return 'endpoint'


def map_event_type(rule_id, groups):
    """Map Wazuh rule to SOC event type."""
    groups_str = ','.join(groups) if isinstance(groups, list) else str(groups)

    if 'authentication_failed' in groups_str:
        return 'auth_failure'
    elif 'authentication_success' in groups_str:
        return 'auth_success'
    elif 'syscheck' in groups_str:
        return 'file_integrity'
    elif any(g in groups_str for g in ['attack', 'exploit']):
        return 'intrusion_attempt'
    elif 'scan' in groups_str:
        return 'port_scan'
    elif any(g in groups_str for g in ['malware', 'virus', 'trojan']):
        return 'malware_detected'
    elif 'policy' in groups_str:
        return 'policy_violation'
    elif 'sudo' in groups_str:
        return 'privilege_escalation'
    else:
        return 'security_alert'


def transform_alert(alert):
    """Transform Wazuh alert to SOC event format."""
    rule = alert.get('rule', {})
    agent = alert.get('agent', {})
    data = alert.get('data', {})

    groups = rule.get('groups', [])
    agent_name = agent.get('name', '')

    soc_event = {
        'source': map_source(groups, agent_name),
        'event_type': map_event_type(rule.get('id', ''), groups),
        'severity': map_severity(rule.get('level', 3)),
        'description': rule.get('description', 'Wazuh alert'),
        'raw_log': alert.get('full_log', ''),
        'site_id': agent.get('name', 'unknown'),
        'timestamp': alert.get('timestamp', ''),
        'metadata': {
            'wazuh_rule_id': rule.get('id'),
            'wazuh_rule_level': rule.get('level'),
            'wazuh_groups': groups,
            'agent_id': agent.get('id'),
            'agent_ip': agent.get('ip'),
            'source_ip': data.get('srcip', ''),
            'dest_ip': data.get('dstip', ''),
            'user': data.get('srcuser', data.get('dstuser', '')),
        }
    }

    return soc_event


def send_to_soc(event):
    """POST event to SOC /api/ingest."""
    payload = json.dumps(event).encode('utf-8')
    req = urllib.request.Request(
        HOOK_URL,
        data=payload,
        headers={'Content-Type': 'application/json'}
    )
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        return resp.status
    except urllib.error.URLError as e:
        print(f"ERROR: Failed to send to SOC: {e}", file=sys.stderr)
        return None


def main():
    # Read alert from file (Wazuh passes alert file path as argv[1])
    alert_file = sys.argv[1] if len(sys.argv) > 1 else None

    if not alert_file:
        print("ERROR: No alert file provided", file=sys.stderr)
        sys.exit(1)

    try:
        with open(alert_file) as f:
            alert = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError) as e:
        print(f"ERROR: Could not read alert file: {e}", file=sys.stderr)
        sys.exit(1)

    # Transform and send
    soc_event = transform_alert(alert)
    status = send_to_soc(soc_event)

    if status and 200 <= status < 300:
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == '__main__':
    main()
