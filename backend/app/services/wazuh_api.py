import requests
import json
from flask import current_app


class WazuhAPI:
    """Service to interact with the Wazuh Manager API."""

    def __init__(self):
        self.base_url = current_app.config.get(
            "WAZUH_API_URL", "https://wazuh-manager:55000"
        )
        self.user = current_app.config.get("WAZUH_API_USER", "wazuh-wui")
        self.password = current_app.config.get("WAZUH_API_PASSWORD", "MyS3cr37P450r.*-")
        self.token = None

        # In a real environment, we'd verify the cert. For the lab with self-signed certs, we disable it.
        self.verify_ssl = False
        import urllib3

        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    def _get_token(self):
        """Authenticate and get a JWT token."""
        url = f"{self.base_url}/security/user/authenticate"
        try:
            response = requests.post(
                url, auth=(self.user, self.password), verify=self.verify_ssl, timeout=5
            )
            response.raise_for_status()
            data = response.json()
            self.token = data["data"]["token"]
            return True
        except Exception as e:
            current_app.logger.error(f"Failed to authenticate with Wazuh API: {e}")
            return False

    def _request(self, method, endpoint, payload=None):
        """Make an authenticated request to the API."""
        if not self.token and not self._get_token():
            return None

        url = f"{self.base_url}{endpoint}"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

        try:
            for attempt in range(2):
                if method.upper() == "GET":
                    response = requests.request(
                        method=method.upper(),
                        url=url,
                        headers=headers,
                        verify=self.verify_ssl,
                        timeout=10,
                        params=payload,
                    )
                else:
                    response = requests.request(
                        method=method.upper(),
                        url=url,
                        headers=headers,
                        verify=self.verify_ssl,
                        timeout=10,
                        json=payload,
                    )

                if (
                    response.status_code == 401 and attempt == 0
                ):  # Token might be expired
                    if self._get_token():
                        headers["Authorization"] = f"Bearer {self.token}"
                        continue
                    else:
                        break

                response.raise_for_status()
                return response.json()

        except Exception as e:
            current_app.logger.error(
                f"Wazuh API request failed ({method} {endpoint}): {e}"
            )
            return None

    def execute_active_response(self, command, arguments=None, agent_list=None):
        """
        Execute an active response command on agents.
        https://documentation.wazuh.com/current/user-manual/api/reference.html#operation/api.controllers.active_response_controller.run_command
        """
        if not agent_list:
            agent_list = ["all"]

        payload = {"command": command, "custom": False}

        if arguments:
            payload["arguments"] = [arguments]

        endpoint = f"/active-response?agents_list={','.join(agent_list)}"

        return self._request("PUT", endpoint, payload=payload)

    def get_agents(self, search=None):
        """Get list of agents."""
        endpoint = "/agents"
        params = {}
        if search:
            params["search"] = search
        return self._request("GET", endpoint, payload=params)
