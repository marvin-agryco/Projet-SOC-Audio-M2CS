FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    apt-transport-https \
    lsb-release \
    gnupg2 \
    python3 \
    python3-pip \
    python3-requests \
    cron \
    rsyslog \
    sudo \
    openssh-server \
    net-tools \
    && rm -rf /var/lib/apt/lists/*

# Install Wazuh agent
RUN curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | gpg --no-default-keyring --keyring gnupg-ring:/usr/share/keyrings/wazuh.gpg --import && \
    chmod 644 /usr/share/keyrings/wazuh.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" | tee /etc/apt/sources.list.d/wazuh.list && \
    apt-get update && \
    WAZUH_MANAGER="wazuh-manager" apt-get install -y wazuh-agent=4.14.2-1 && \
    rm -rf /var/lib/apt/lists/*

# Copy log generator
COPY log-generator.py /opt/log-generator.py
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create fake users for simulating login events
RUN useradd -m -s /bin/bash audioprothesiste && \
    useradd -m -s /bin/bash receptionist && \
    useradd -m -s /bin/bash admin_center

ENTRYPOINT ["/entrypoint.sh"]
