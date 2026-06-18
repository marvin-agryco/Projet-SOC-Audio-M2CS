#!/usr/bin/env python3
"""
Generates realistic iptables log entries to /var/log/firewall/iptables.log.
Used because Docker containers can't read /proc/kmsg without SYS_ADMIN.
The actual iptables rules still enforce real packet filtering.
"""
import time
import random
import datetime
import os
import threading
import requests

LOG_FILE = "/var/log/firewall/iptables.log"
BACKEND_URL = os.environ.get('BACKEND_URL', 'http://soc-backend:5000')
SITE_ID     = os.environ.get('SITE_ID', 'firewall-gw')

# Simulated attacker IPs (external/DMZ side)
EXTERNAL_IPS = [
    "185.220.101.42", "45.33.32.156", "198.51.100.23",
    "203.0.113.99",   "91.108.4.18",  "192.0.2.5",
    "185.130.5.231",  "66.240.236.119"
]

# Internal endpoints (infra-net side)
INTERNAL_IPS = ["172.20.0.10", "172.20.0.11", "172.20.0.12"]

PROTOCOLS = ["TCP", "UDP", "ICMP"]

DROP_PORTS   = [22, 23, 3389, 445, 1433, 3306, 5900, 8080, 4444]
ACCEPT_PORTS = [80, 443, 53, 8080]


def ts():
    return datetime.datetime.now().strftime("%b %d %H:%M:%S")


def mac():
    return "02:42:ac:19:00:02:02:42:ac:19:00:03:08:00"


def dropped_line(src_ip, dst_ip, dport, proto="TCP"):
    return (
        f"{ts()} firewall-gw kernel: IPTables-Dropped: "
        f"IN=eth0 OUT=eth1 MAC={mac()} "
        f"SRC={src_ip} DST={dst_ip} LEN=60 TTL=64 ID={random.randint(1000,9999)} "
        f"PROTO={proto} SPT={random.randint(1024,65535)} DPT={dport} "
        f"WINDOW=29200 RES=0x00 SYN URGP=0"
    )


def accepted_line(src_ip, dst_ip, dport):
    return (
        f"{ts()} firewall-gw kernel: HTTP-Access: "
        f"IN=eth1 OUT=eth0 MAC={mac()} "
        f"SRC={src_ip} DST={dst_ip} LEN=52 TTL=63 ID={random.randint(1000,9999)} "
        f"PROTO=TCP SPT={random.randint(1024,65535)} DPT={dport} "
        f"WINDOW=502 RES=0x00 ACK URGP=0"
    )


def write_log(line):
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")
    print(line, flush=True)


def _heartbeat():
    """Send a keepalive to the SOC backend every 5 minutes."""
    while True:
        time.sleep(300)
        try:
            requests.post(f"{BACKEND_URL}/api/ingest", json={
                "source": "firewall",
                "event_type": "keepalive",
                "severity": "low",
                "description": f"Agent keepalive from {SITE_ID}",
                "site_id": SITE_ID,
                "metadata": {}
            }, timeout=5)
        except Exception:
            pass


def main():
    print(f"[log-generator] Writing iptables logs to {LOG_FILE}", flush=True)
    threading.Thread(target=_heartbeat, daemon=True).start()
    while True:
        # ~70% chance of a dropped packet event
        if random.random() < 0.7:
            src = random.choice(EXTERNAL_IPS)
            dst = random.choice(INTERNAL_IPS)
            dport = random.choice(DROP_PORTS)
            proto = random.choice(PROTOCOLS)
            write_log(dropped_line(src, dst, dport, proto))

        # ~30% chance of an accepted/forwarded packet
        if random.random() < 0.3:
            src = random.choice(INTERNAL_IPS)
            dst = random.choice(EXTERNAL_IPS)
            dport = random.choice(ACCEPT_PORTS)
            write_log(accepted_line(src, dst, dport))

        # Sleep 10-40s between events (realistic low-traffic rate)
        time.sleep(random.uniform(10, 40))


if __name__ == "__main__":
    main()
