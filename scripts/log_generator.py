#!/usr/bin/env python3
"""
Log Generator for SOC Dashboard Demo
Simulates security events from real infrastructure nodes
"""

import random
import time
import requests
import argparse
from datetime import datetime, timedelta, timezone
from typing import Optional

# Configuration
API_URL = "http://localhost:5000/api/ingest"

# Sites — 30 French audio centers (matches GLPI/dashboard configuration)
SITES = [
    "AUDIO_Paris_Bastille", "AUDIO_Paris_Opera", "AUDIO_Paris_Marais",
    "AUDIO_Paris_Montparnasse", "AUDIO_Paris_Nation", "AUDIO_Paris_Republique",
    "AUDIO_Versailles", "AUDIO_Boulogne", "AUDIO_Nanterre",
    "AUDIO_SaintDenis", "AUDIO_Creteil", "AUDIO_Argenteuil", "AUDIO_Montreuil",
    "AUDIO_Lyon_PartDieu", "AUDIO_Lyon_Confluence",
    "AUDIO_Marseille_VieuxPort", "AUDIO_Marseille_Castellane",
    "AUDIO_Toulouse_Capitole", "AUDIO_Toulouse_Blagnac",
    "AUDIO_Bordeaux_Meriadeck", "AUDIO_Bordeaux_Chartrons",
    "AUDIO_Nice", "AUDIO_Strasbourg", "AUDIO_Nantes",
    "AUDIO_Montpellier", "AUDIO_Lille", "AUDIO_Rennes",
    "AUDIO_Grenoble", "AUDIO_Toulon", "AUDIO_Clermont",
]

# Event templates by source — only real infrastructure sources
EVENT_TEMPLATES = {
    "firewall": [
        {"event_type": "blocked_connection", "severity": "low", "description": "Blocked outbound connection to suspicious IP"},
        {"event_type": "port_scan", "severity": "high", "description": "Port scan detected from external IP"},
        {"event_type": "intrusion_attempt", "severity": "critical", "description": "Potential intrusion attempt blocked"},
        {"event_type": "config_change", "severity": "medium", "description": "Firewall configuration modified"},
        {"event_type": "vpn_connection", "severity": "low", "description": "VPN tunnel established"},
    ],
    "endpoint": [
        {"event_type": "malware_detected", "severity": "critical", "description": "Malware detected and quarantined on workstation"},
        {"event_type": "usb_device", "severity": "medium", "description": "Unauthorized USB device connected"},
        {"event_type": "suspicious_process", "severity": "high", "description": "Suspicious process execution detected"},
        {"event_type": "auth_failure", "severity": "medium", "description": "Multiple failed login attempts on endpoint"},
        {"event_type": "software_install", "severity": "low", "description": "New software installed on endpoint"},
        {"event_type": "privilege_escalation", "severity": "critical", "description": "Privilege escalation detected"},
        {"event_type": "account_lockout", "severity": "high", "description": "User account locked out after failed attempts"},
        {"event_type": "file_integrity", "severity": "medium", "description": "File integrity change detected on endpoint"},
    ],
    "application": [
        {"event_type": "auth_failure", "severity": "medium", "description": "Failed login attempt on GLPI console"},
        {"event_type": "config_change", "severity": "high", "description": "GLPI configuration modified"},
        {"event_type": "asset_change", "severity": "low", "description": "IT asset record created or updated in GLPI"},
        {"event_type": "user_management", "severity": "medium", "description": "GLPI user account created or modified"},
        {"event_type": "api_access", "severity": "low", "description": "GLPI REST API access from external IP"},
        {"event_type": "data_export", "severity": "high", "description": "Bulk data export performed from GLPI"},
    ],
    "ids": [
        {"event_type": "intrusion_attempt", "severity": "critical", "description": "Suricata: Possible exploit attempt detected (ET EXPLOIT)"},
        {"event_type": "port_scan", "severity": "high", "description": "Suricata: Network scan detected (ET SCAN)"},
        {"event_type": "malware_detected", "severity": "critical", "description": "Suricata: Malware traffic signature matched (ET MALWARE)"},
        {"event_type": "policy_violation", "severity": "medium", "description": "Suricata: Policy violation detected (ET POLICY)"},
        {"event_type": "intrusion_attempt", "severity": "high", "description": "Suricata: Suspicious inbound traffic to database port"},
        {"event_type": "security_alert", "severity": "medium", "description": "Suricata: Potentially bad traffic pattern detected"},
        {"event_type": "intrusion_attempt", "severity": "critical", "description": "Suricata: Known exploit signature matched (CVE)"},
    ],
}

# IP addresses for realism
INTERNAL_IPS = [f"192.168.{random.randint(1, 10)}.{random.randint(1, 254)}" for _ in range(50)]
EXTERNAL_IPS = [f"{random.randint(1, 223)}.{random.randint(0, 255)}.{random.randint(0, 255)}.{random.randint(1, 254)}" for _ in range(30)]
USERS = ["jdupont", "mmartin", "lbernard", "adurand", "pmoreau", "sthomas", "crichard", "nrobert", "admin", "audioproth"]


def generate_raw_log(source: str, event_type: str) -> str:
    """Generate a realistic raw log entry."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    templates = {
        "firewall": f"{timestamp} FW-001 BLOCK src={random.choice(EXTERNAL_IPS)} dst={random.choice(INTERNAL_IPS)} proto=TCP dport={random.choice([22, 23, 445, 3389, 8080])}",
        "endpoint": f"{timestamp} ENDPOINT-{random.randint(100, 999)} Event={event_type} User={random.choice(USERS)} Host={random.choice(SITES)} Status=Detected",
        "application": f"{timestamp} GLPI [access] {event_type} user={random.choice(USERS)} ip={random.choice(EXTERNAL_IPS)} action={event_type}",
        "ids": f'{timestamp} suricata[{random.randint(1000,9999)}]: [{random.randint(1,3)}:{random.randint(2000000,2099999)}:{random.randint(1,10)}] ET {random.choice(["SCAN", "EXPLOIT", "MALWARE", "POLICY"])} {event_type} {{TCP}} {random.choice(EXTERNAL_IPS)}:{random.randint(1024,65535)} -> {random.choice(INTERNAL_IPS)}:{random.choice([22, 80, 443, 445, 3389, 8080])}',
    }

    return templates.get(source, f"{timestamp} {event_type}")


SOURCE_WEIGHTS = {
    # Realistic SOC distribution:
    # Firewalls are the noisiest (perimeter, NAT, allow/deny for all traffic)
    # Endpoints second (EDR agents on workstations/servers)
    # IDS is filtered/alerting layer — less volume than raw firewall
    # Application (GLPI) is low-frequency IT ops events
    "firewall": 40,
    "endpoint": 30,
    "application": 10,
    "ids": 20,
}


def generate_event() -> dict:
    """Generate a random security event."""
    sources = list(EVENT_TEMPLATES.keys())
    weights = [SOURCE_WEIGHTS[s] for s in sources]
    source = random.choices(sources, weights=weights, k=1)[0]
    template = random.choice(EVENT_TEMPLATES[source])
    site = random.choice(SITES)

    # Add some variation to severity based on probability
    severity = template["severity"]
    if random.random() < 0.1:  # 10% chance to escalate
        severity_levels = ["low", "medium", "high", "critical"]
        current_idx = severity_levels.index(severity)
        if current_idx < 3:
            severity = severity_levels[current_idx + 1]

    event = {
        "source": source,
        "event_type": template["event_type"],
        "severity": severity,
        "description": f"[{site}] {template['description']}",
        "raw_log": generate_raw_log(source, template["event_type"]),
        "metadata": {
            "source_ip": random.choice(INTERNAL_IPS + EXTERNAL_IPS),
            "user": random.choice(USERS) if random.random() > 0.3 else None,
            "hostname": f"WS-{site}-{random.randint(1, 20):02d}" if random.random() > 0.5 else None,
        },
        "site_id": site,
    }

    return event


def send_event(event: dict) -> bool:
    """Send event to the API."""
    try:
        response = requests.post(API_URL, json=event, timeout=5)
        return response.status_code == 201
    except requests.RequestException as e:
        print(f"Failed to send event: {e}")
        return False


def run_generator(interval: float = 2.0, burst: bool = False, count: Optional[int] = None):
    """Run the log generator."""
    print(f"Starting log generator (interval: {interval}s, burst: {burst})")
    print(f"Sending events to: {API_URL}")
    print("-" * 50)

    sent = 0
    while count is None or sent < count:
        # Generate and send event
        event = generate_event()
        success = send_event(event)

        if success:
            sent += 1
            severity_color = {
                "critical": "\033[91m",  # Red
                "high": "\033[93m",      # Yellow
                "medium": "\033[94m",    # Blue
                "low": "\033[92m",       # Green
            }
            reset = "\033[0m"
            color = severity_color.get(event["severity"], "")

            print(f"[{sent}] {color}{event['severity'].upper():8}{reset} | {event['source']:12} | {event['event_type']:25} | {event['site_id']}")

        # Burst mode: occasionally send multiple events quickly
        if burst and random.random() < 0.1:
            print("  >> Burst mode: sending rapid events...")
            for _ in range(random.randint(3, 10)):
                burst_event = generate_event()
                burst_event["severity"] = random.choice(["high", "critical"])  # Burst = attack simulation
                send_event(burst_event)
                sent += 1
                time.sleep(0.1)

        time.sleep(interval)


def generate_attack_scenario():
    """Generate a realistic attack scenario (for demo)."""
    print("Generating attack scenario simulation...")
    print("-" * 50)

    site = random.choice(SITES)
    attacker_ip = random.choice(EXTERNAL_IPS)
    target_user = random.choice(USERS)

    scenario = [
        # Phase 1: Reconnaissance (IDS + Firewall detect scanning)
        {"source": "ids", "event_type": "port_scan", "severity": "high",
         "description": f"[{site}] Suricata: Nmap scan detected from {attacker_ip}"},
        {"source": "firewall", "event_type": "port_scan", "severity": "high",
         "description": f"[{site}] Port scan from {attacker_ip}"},
        {"source": "firewall", "event_type": "blocked_connection", "severity": "medium",
         "description": f"[{site}] Multiple blocked connections from {attacker_ip}"},

        # Phase 2: Initial Access — brute force
        {"source": "endpoint", "event_type": "auth_failure", "severity": "medium",
         "description": f"[{site}] Failed SSH login attempt for {target_user} from {attacker_ip}"},
        {"source": "endpoint", "event_type": "auth_failure", "severity": "high",
         "description": f"[{site}] Multiple failed login attempts for {target_user}"},
        {"source": "endpoint", "event_type": "account_lockout", "severity": "high",
         "description": f"[{site}] Account {target_user} locked after repeated failures"},

        # Phase 3: Execution
        {"source": "endpoint", "event_type": "suspicious_process", "severity": "high",
         "description": f"[{site}] Suspicious process execution on {target_user}'s workstation"},
        {"source": "endpoint", "event_type": "malware_detected", "severity": "critical",
         "description": f"[{site}] Malicious payload executed on {target_user}'s workstation"},

        # Phase 4: Privilege Escalation
        {"source": "endpoint", "event_type": "privilege_escalation", "severity": "critical",
         "description": f"[{site}] Privilege escalation attempt detected"},
        {"source": "endpoint", "event_type": "file_integrity", "severity": "medium",
         "description": f"[{site}] Critical system file modified"},

        # Phase 5: Exfiltration (IDS + Firewall detect C2 traffic)
        {"source": "ids", "event_type": "malware_detected", "severity": "critical",
         "description": f"[{site}] Suricata: Possible C2 beacon traffic detected from compromised host"},
        {"source": "firewall", "event_type": "intrusion_attempt", "severity": "critical",
         "description": f"[{site}] Unusual outbound data transfer detected from compromised host"},
    ]

    for i, event in enumerate(scenario):
        event["site_id"] = site
        # source_ip is the canonical key used by Top Source IPs and triage enrichment.
        event["metadata"] = {
            "source_ip": attacker_ip,
            "target_user": target_user,
        }
        event["raw_log"] = generate_raw_log(event["source"], event["event_type"])
        event["timestamp"] = datetime.now(timezone.utc).isoformat()

        success = send_event(event)
        status = "OK" if success else "FAILED"
        print(f"[{i+1}/{len(scenario)}] {event['severity'].upper():8} | {event['event_type']:25} | {status}")
        time.sleep(1)

    print("-" * 50)
    print("Attack scenario complete!")


def run_backfill(days: int = 7, count: int = 1000):
    """Generate historical events spread across a time range.

    Args:
        days: Number of days to backfill (default: 7)
        count: Total number of events to generate (default: 1000)
    """
    print(f"Backfilling {count} events over the last {days} days...")
    print("-" * 50)

    now = datetime.now()
    start_time = now - timedelta(days=days)
    time_range_seconds = days * 24 * 60 * 60

    # Generate events with random timestamps spread across the time range
    sent = 0
    failed = 0

    # Create batches for efficiency
    batch_size = 50
    batch = []

    for i in range(count):
        # Generate random timestamp within the range
        random_seconds = random.random() * time_range_seconds
        event_time = start_time + timedelta(seconds=random_seconds)

        # Generate event
        event = generate_event()
        event["timestamp"] = event_time.isoformat()

        # Update raw_log with correct timestamp
        event["raw_log"] = event["raw_log"].replace(
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            event_time.strftime("%Y-%m-%d %H:%M:%S")
        )

        batch.append(event)

        # Send batch when full
        if len(batch) >= batch_size:
            try:
                response = requests.post(
                    API_URL.replace('/ingest', '/ingest/batch'),
                    json={"events": batch},
                    timeout=30
                )
                if response.status_code == 201:
                    result = response.json()
                    sent += result.get('created', 0)
                    failed += len(result.get('errors', []))
                else:
                    failed += len(batch)
            except requests.RequestException as e:
                print(f"Batch failed: {e}")
                failed += len(batch)

            # Progress update
            progress = ((i + 1) / count) * 100
            print(f"Progress: {progress:.1f}% ({sent} sent, {failed} failed)")
            batch = []

    # Send remaining events
    if batch:
        try:
            response = requests.post(
                API_URL.replace('/ingest', '/ingest/batch'),
                json={"events": batch},
                timeout=30
            )
            if response.status_code == 201:
                result = response.json()
                sent += result.get('created', 0)
                failed += len(result.get('errors', []))
            else:
                failed += len(batch)
        except requests.RequestException as e:
            print(f"Final batch failed: {e}")
            failed += len(batch)

    print("-" * 50)
    print(f"Backfill complete!")
    print(f"  - Events sent: {sent}")
    print(f"  - Events failed: {failed}")
    print(f"  - Time range: {start_time.strftime('%Y-%m-%d %H:%M')} to {now.strftime('%Y-%m-%d %H:%M')}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SOC Dashboard Log Generator")
    parser.add_argument("--interval", "-i", type=float, default=2.0, help="Interval between events (seconds)")
    parser.add_argument("--burst", "-b", action="store_true", help="Enable burst mode (simulates attacks)")
    parser.add_argument("--count", "-c", type=int, help="Number of events to generate (infinite if not set)")
    parser.add_argument("--attack", "-a", action="store_true", help="Generate attack scenario")
    parser.add_argument("--backfill", action="store_true", help="Generate historical events (backfill)")
    parser.add_argument("--days", "-d", type=int, default=7, help="Number of days to backfill (default: 7)")
    parser.add_argument("--url", "-u", type=str, default=API_URL, help="API URL")

    args = parser.parse_args()
    API_URL = args.url

    if args.attack:
        generate_attack_scenario()
    elif args.backfill:
        backfill_count = args.count if args.count else 1000
        run_backfill(days=args.days, count=backfill_count)
    else:
        run_generator(interval=args.interval, burst=args.burst, count=args.count)
