#!/usr/bin/env python3
"""
Log Generator for SOC Dashboard Demo
Simulates security events from audioprothésiste network (30 sites)
"""

import random
import time
import requests
import argparse
from datetime import datetime, timedelta
from typing import Optional

# Configuration
API_URL = "http://localhost:5000/api/ingest"

# Sites (30 audioprothésiste centers)
SITES = [f"AUDIO_{str(i).zfill(3)}" for i in range(1, 31)]

# Event templates by source
EVENT_TEMPLATES = {
    "firewall": [
        {"event_type": "blocked_connection", "severity": "low", "description": "Blocked outbound connection to suspicious IP"},
        {"event_type": "port_scan", "severity": "high", "description": "Port scan detected from external IP"},
        {"event_type": "intrusion_attempt", "severity": "critical", "description": "Potential intrusion attempt blocked"},
        {"event_type": "config_change", "severity": "medium", "description": "Firewall configuration modified"},
        {"event_type": "vpn_connection", "severity": "low", "description": "VPN tunnel established"},
    ],
    "ids": [
        {"event_type": "signature_match", "severity": "high", "description": "IDS signature match: possible exploit attempt"},
        {"event_type": "anomaly_detected", "severity": "medium", "description": "Anomalous network behavior detected"},
        {"event_type": "malware_signature", "severity": "critical", "description": "Known malware signature detected in traffic"},
        {"event_type": "protocol_violation", "severity": "medium", "description": "Protocol violation detected"},
    ],
    "endpoint": [
        {"event_type": "malware_detected", "severity": "critical", "description": "Malware detected and quarantined on workstation"},
        {"event_type": "usb_device", "severity": "medium", "description": "Unauthorized USB device connected"},
        {"event_type": "suspicious_process", "severity": "high", "description": "Suspicious process execution detected"},
        {"event_type": "auth_failure", "severity": "medium", "description": "Multiple failed login attempts on workstation"},
        {"event_type": "software_install", "severity": "low", "description": "New software installed on endpoint"},
    ],
    "active_directory": [
        {"event_type": "auth_failure", "severity": "medium", "description": "Failed authentication attempt"},
        {"event_type": "privilege_escalation", "severity": "critical", "description": "Privilege escalation detected"},
        {"event_type": "account_lockout", "severity": "high", "description": "User account locked out after failed attempts"},
        {"event_type": "group_membership_change", "severity": "medium", "description": "User added to privileged group"},
        {"event_type": "password_change", "severity": "low", "description": "Password changed for user account"},
    ],
    "email": [
        {"event_type": "phishing_attempt", "severity": "high", "description": "Potential phishing email detected and blocked"},
        {"event_type": "malicious_attachment", "severity": "critical", "description": "Malicious attachment blocked"},
        {"event_type": "spam_detected", "severity": "low", "description": "Spam email filtered"},
        {"event_type": "suspicious_sender", "severity": "medium", "description": "Email from suspicious sender quarantined"},
    ],
    "application": [
        {"event_type": "database_error", "severity": "medium", "description": "CRM database connection error"},
        {"event_type": "unauthorized_access", "severity": "high", "description": "Unauthorized access attempt to patient records"},
        {"event_type": "data_export", "severity": "medium", "description": "Large data export from application"},
        {"event_type": "session_hijack", "severity": "critical", "description": "Possible session hijacking detected"},
    ],
    "network": [
        {"event_type": "bandwidth_anomaly", "severity": "medium", "description": "Unusual bandwidth consumption detected"},
        {"event_type": "dns_exfiltration", "severity": "high", "description": "Possible DNS data exfiltration attempt"},
        {"event_type": "lateral_movement", "severity": "critical", "description": "Lateral movement detected in network"},
        {"event_type": "connection_refused", "severity": "low", "description": "Connection refused to internal service"},
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
        "ids": f"{timestamp} [**] [1:{random.randint(1000, 9999)}:{random.randint(1, 10)}] {event_type.upper()} [**] {random.choice(EXTERNAL_IPS)} -> {random.choice(INTERNAL_IPS)}",
        "endpoint": f"{timestamp} ENDPOINT-{random.randint(100, 999)} Event={event_type} User={random.choice(USERS)} Status=Detected",
        "active_directory": f"{timestamp} EventID={random.choice([4625, 4624, 4728, 4732])} User={random.choice(USERS)} Domain=AUDIOPRO Workstation={random.choice(SITES)}",
        "email": f"{timestamp} SMTP From=<{random.choice(['suspicious', 'unknown', 'spam'])}@{random.choice(['malware.net', 'phish.com', 'bad.org'])}> To=<{random.choice(USERS)}@audiopro.fr>",
        "application": f"{timestamp} APP-LOG Level=WARN Module=CRM Action={event_type} User={random.choice(USERS)} IP={random.choice(INTERNAL_IPS)}",
        "network": f"{timestamp} FLOW src={random.choice(INTERNAL_IPS)} dst={random.choice(EXTERNAL_IPS)} bytes={random.randint(100, 1000000)} proto=TCP",
    }

    return templates.get(source, f"{timestamp} {event_type}")


def generate_event() -> dict:
    """Generate a random security event."""
    source = random.choice(list(EVENT_TEMPLATES.keys()))
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
        # Phase 1: Reconnaissance
        {"source": "firewall", "event_type": "port_scan", "severity": "high",
         "description": f"[{site}] Port scan from {attacker_ip}"},
        {"source": "ids", "event_type": "signature_match", "severity": "medium",
         "description": f"[{site}] Network reconnaissance detected"},

        # Phase 2: Initial Access
        {"source": "email", "event_type": "phishing_attempt", "severity": "high",
         "description": f"[{site}] Phishing email targeting {target_user}"},
        {"source": "endpoint", "event_type": "suspicious_process", "severity": "high",
         "description": f"[{site}] Macro execution in Office document"},

        # Phase 3: Execution
        {"source": "endpoint", "event_type": "malware_detected", "severity": "critical",
         "description": f"[{site}] Malicious payload executed on {target_user}'s workstation"},
        {"source": "active_directory", "event_type": "auth_failure", "severity": "medium",
         "description": f"[{site}] Multiple failed auth attempts for {target_user}"},

        # Phase 4: Lateral Movement
        {"source": "network", "event_type": "lateral_movement", "severity": "critical",
         "description": f"[{site}] Lateral movement detected from compromised host"},
        {"source": "active_directory", "event_type": "privilege_escalation", "severity": "critical",
         "description": f"[{site}] Privilege escalation attempt detected"},

        # Phase 5: Data Access
        {"source": "application", "event_type": "unauthorized_access", "severity": "critical",
         "description": f"[{site}] Unauthorized access to patient database"},
        {"source": "network", "event_type": "dns_exfiltration", "severity": "critical",
         "description": f"[{site}] Possible data exfiltration via DNS"},
    ]

    for i, event in enumerate(scenario):
        event["site_id"] = site
        event["metadata"] = {"attacker_ip": attacker_ip, "target_user": target_user}
        event["raw_log"] = generate_raw_log(event["source"], event["event_type"])

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
