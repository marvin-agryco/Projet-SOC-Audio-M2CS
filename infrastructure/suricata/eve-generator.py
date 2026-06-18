#!/usr/bin/env python3
"""
Generates realistic Suricata EVE JSON entries to /var/log/suricata/eve.json.
Used because real packet capture is limited in Docker/WSL2 without host networking.
Suricata is installed in the container for authenticity; this generator supplements
it with realistic alert data that Wazuh can ingest natively.
"""
import json
import time
import random
import datetime
import os
import threading
import requests

LOG_FILE = "/var/log/suricata/eve.json"
BACKEND_URL = os.environ.get('BACKEND_URL', 'http://soc-backend:5000')
SITE_ID     = os.environ.get('SITE_ID', 'suricata-1')

# Simulated external attacker IPs
EXTERNAL_IPS = [
    "185.220.101.42", "45.33.32.156", "198.51.100.23",
    "203.0.113.99", "91.108.4.18", "192.0.2.5",
    "185.130.5.231", "66.240.236.119", "104.248.50.87",
    "159.89.176.22", "178.62.30.44", "46.101.25.135",
]

# Internal / DMZ IPs
INTERNAL_IPS = ["172.25.0.10", "172.25.0.11", "172.25.0.12", "172.25.0.1"]

# Suricata signature categories and IDs (based on Emerging Threats Open ruleset)
ALERT_SIGNATURES = [
    {
        "signature_id": 2001219,
        "signature": "ET SCAN Potential SSH Scan",
        "category": "Attempted Information Leak",
        "severity": 2,
        "proto": "TCP",
        "dest_port": 22,
    },
    {
        "signature_id": 2010935,
        "signature": "ET SCAN Suspicious inbound to MSSQL port 1433",
        "category": "Potentially Bad Traffic",
        "severity": 2,
        "proto": "TCP",
        "dest_port": 1433,
    },
    {
        "signature_id": 2024291,
        "signature": "ET EXPLOIT Possible CVE-2021-44228 Log4j RCE Attempt",
        "category": "Attempted Administrator Privilege Gain",
        "severity": 1,
        "proto": "TCP",
        "dest_port": 8080,
    },
    {
        "signature_id": 2013028,
        "signature": "ET POLICY curl User-Agent Outbound",
        "category": "Potential Corporate Privacy Violation",
        "severity": 3,
        "proto": "TCP",
        "dest_port": 80,
    },
    {
        "signature_id": 2100498,
        "signature": "GPL ATTACK_RESPONSE id check returned root",
        "category": "Potentially Bad Traffic",
        "severity": 1,
        "proto": "TCP",
        "dest_port": 80,
    },
    {
        "signature_id": 2002910,
        "signature": "ET SCAN Potential VNC Scan 5800-5820",
        "category": "Attempted Information Leak",
        "severity": 2,
        "proto": "TCP",
        "dest_port": 5900,
    },
    {
        "signature_id": 2009358,
        "signature": "ET SCAN Nmap Scripting Engine User-Agent Detected",
        "category": "Attempted Information Leak",
        "severity": 2,
        "proto": "TCP",
        "dest_port": 443,
    },
    {
        "signature_id": 2027865,
        "signature": "ET MALWARE Possible Metasploit Payload Common Coverage",
        "category": "A Network Trojan was Detected",
        "severity": 1,
        "proto": "TCP",
        "dest_port": 4444,
    },
    {
        "signature_id": 2025711,
        "signature": "ET POLICY DNS Query to .onion Proxy Domain",
        "category": "Potential Corporate Privacy Violation",
        "severity": 2,
        "proto": "UDP",
        "dest_port": 53,
    },
    {
        "signature_id": 2016150,
        "signature": "ET INFO Executable Download from dotted-quad Host",
        "category": "Potentially Bad Traffic",
        "severity": 2,
        "proto": "TCP",
        "dest_port": 80,
    },
    {
        "signature_id": 2028702,
        "signature": "ET EXPLOIT Possible EternalBlue MS17-010 Echo Response",
        "category": "Attempted Administrator Privilege Gain",
        "severity": 1,
        "proto": "TCP",
        "dest_port": 445,
    },
    {
        "signature_id": 2019401,
        "signature": "ET SCAN Possible Brute Force Attack on RDP",
        "category": "Attempted Information Leak",
        "severity": 2,
        "proto": "TCP",
        "dest_port": 3389,
    },
]

# DNS query templates for dns event type
DNS_QUERIES = [
    "evil.example.com", "c2.malware.net", "updates.legit-software.com",
    "api.example.org", "login.internal.local", "phishing-site.xyz",
    "download.suspicious.ru", "tracker.ads.co",
]

# HTTP request templates
HTTP_REQUESTS = [
    {"method": "GET", "url": "/admin/login.php", "status": 403},
    {"method": "POST", "url": "/api/v1/upload", "status": 200},
    {"method": "GET", "url": "/wp-login.php", "status": 404},
    {"method": "GET", "url": "/.env", "status": 403},
    {"method": "POST", "url": "/cgi-bin/shell.cgi", "status": 404},
    {"method": "GET", "url": "/actuator/health", "status": 200},
]


def iso_now():
    """Return current UTC time in ISO 8601 format (Suricata style)."""
    return datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "+0000"


def gen_flow_id():
    """Generate a random flow ID."""
    return random.randint(1000000000, 9999999999)


def generate_alert_event():
    """Generate a Suricata alert EVE JSON entry."""
    sig = random.choice(ALERT_SIGNATURES)
    src_ip = random.choice(EXTERNAL_IPS)
    dst_ip = random.choice(INTERNAL_IPS)

    return {
        "timestamp": iso_now(),
        "flow_id": gen_flow_id(),
        "in_iface": "eth0",
        "event_type": "alert",
        "src_ip": src_ip,
        "src_port": random.randint(1024, 65535),
        "dest_ip": dst_ip,
        "dest_port": sig["dest_port"],
        "proto": sig["proto"],
        "alert": {
            "action": "allowed",
            "gid": 1,
            "signature_id": sig["signature_id"],
            "rev": random.randint(1, 10),
            "signature": sig["signature"],
            "category": sig["category"],
            "severity": sig["severity"],
        },
        "app_proto": "failed" if sig["dest_port"] not in [80, 443, 8080] else "http",
    }


def generate_dns_event():
    """Generate a Suricata DNS EVE JSON entry."""
    src_ip = random.choice(INTERNAL_IPS)
    query = random.choice(DNS_QUERIES)

    return {
        "timestamp": iso_now(),
        "flow_id": gen_flow_id(),
        "in_iface": "eth0",
        "event_type": "dns",
        "src_ip": src_ip,
        "src_port": random.randint(1024, 65535),
        "dest_ip": "8.8.8.8",
        "dest_port": 53,
        "proto": "UDP",
        "dns": {
            "type": "query",
            "id": random.randint(1, 65535),
            "rrname": query,
            "rrtype": "A",
        },
    }


def generate_http_event():
    """Generate a Suricata HTTP EVE JSON entry."""
    src_ip = random.choice(EXTERNAL_IPS)
    dst_ip = random.choice(INTERNAL_IPS)
    req = random.choice(HTTP_REQUESTS)

    return {
        "timestamp": iso_now(),
        "flow_id": gen_flow_id(),
        "in_iface": "eth0",
        "event_type": "http",
        "src_ip": src_ip,
        "src_port": random.randint(1024, 65535),
        "dest_ip": dst_ip,
        "dest_port": 80,
        "proto": "TCP",
        "http": {
            "hostname": dst_ip,
            "url": req["url"],
            "http_user_agent": "Mozilla/5.0 (compatible; scanner/1.0)",
            "http_method": req["method"],
            "protocol": "HTTP/1.1",
            "status": req["status"],
            "length": random.randint(100, 50000),
        },
    }


def generate_tls_event():
    """Generate a Suricata TLS EVE JSON entry."""
    src_ip = random.choice(INTERNAL_IPS)
    dst_ip = random.choice(EXTERNAL_IPS)

    return {
        "timestamp": iso_now(),
        "flow_id": gen_flow_id(),
        "in_iface": "eth0",
        "event_type": "tls",
        "src_ip": src_ip,
        "src_port": random.randint(1024, 65535),
        "dest_ip": dst_ip,
        "dest_port": 443,
        "proto": "TCP",
        "tls": {
            "subject": f"CN=*.{random.choice(DNS_QUERIES).split('.')[-2]}.com",
            "issuerdn": "CN=Let's Encrypt Authority X3, O=Let's Encrypt, C=US",
            "serial": f"{random.randint(100000, 999999):06X}",
            "fingerprint": ":".join(f"{random.randint(0,255):02x}" for _ in range(20)),
            "version": "TLS 1.2",
        },
    }


def write_eve(entry):
    """Append a single EVE JSON line to the log file."""
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")
    print(json.dumps({"event_type": entry["event_type"], "src_ip": entry["src_ip"]}), flush=True)


def _heartbeat():
    """Send a keepalive to the SOC backend every 5 minutes."""
    while True:
        time.sleep(300)
        try:
            requests.post(f"{BACKEND_URL}/api/ingest", json={
                "source": "ids",
                "event_type": "keepalive",
                "severity": "low",
                "description": f"Agent keepalive from {SITE_ID}",
                "site_id": SITE_ID,
                "metadata": {}
            }, timeout=5)
        except Exception:
            pass


def main():
    print(f"[eve-generator] Writing Suricata EVE JSON to {LOG_FILE}", flush=True)
    threading.Thread(target=_heartbeat, daemon=True).start()

    # Event generators weighted: alerts most common (Wazuh cares about these),
    # then HTTP, DNS, TLS for realism
    generators = [
        (generate_alert_event, 0.50),
        (generate_http_event, 0.20),
        (generate_dns_event, 0.20),
        (generate_tls_event, 0.10),
    ]

    while True:
        # Pick event type by weight
        r = random.random()
        cumulative = 0
        for gen_func, weight in generators:
            cumulative += weight
            if r <= cumulative:
                entry = gen_func()
                write_eve(entry)
                break

        # Sleep 5-25s between events (realistic for a small network)
        time.sleep(random.uniform(5, 25))


if __name__ == "__main__":
    main()
