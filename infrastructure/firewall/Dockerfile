FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    curl \
    apt-transport-https \
    lsb-release \
    gnupg2 \
    iptables \
    iproute2 \
    rsyslog \
    python3 \
    python3-requests \
    && rm -rf /var/lib/apt/lists/*

# Disable imklog: containers can't read /proc/kmsg without SYS_ADMIN
RUN sed -i '/imklog/s/^/#/' /etc/rsyslog.conf

# Install Wazuh agent (same version as endpoints)
RUN curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | gpg --no-default-keyring \
        --keyring gnupg-ring:/usr/share/keyrings/wazuh.gpg --import && \
    chmod 644 /usr/share/keyrings/wazuh.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" \
        | tee /etc/apt/sources.list.d/wazuh.list && \
    apt-get update && \
    WAZUH_MANAGER="wazuh-manager" apt-get install -y wazuh-agent=4.14.2-1 && \
    rm -rf /var/lib/apt/lists/*

COPY rsyslog-iptables.conf /etc/rsyslog.d/10-iptables.conf
COPY log-generator.py /opt/log-generator.py
COPY start.sh /start.sh
RUN chmod +x /start.sh

ENTRYPOINT ["/start.sh"]
