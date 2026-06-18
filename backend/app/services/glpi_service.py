"""GLPI REST API client for asset management integration."""
import os
import requests
from typing import Optional


GLPI_URL = os.getenv('GLPI_URL', 'http://glpi-crm/apirest.php')
GLPI_APP_TOKEN = os.getenv('GLPI_APP_TOKEN', '')
GLPI_USER_TOKEN = os.getenv('GLPI_USER_TOKEN', '')


class GLPIClient:
    def __init__(self):
        self.base_url = GLPI_URL
        self.app_token = GLPI_APP_TOKEN
        self.user_token = GLPI_USER_TOKEN
        self.session_token: Optional[str] = None

    def _init_session(self) -> bool:
        """Authenticate and get a session token."""
        if not self.user_token:
            return False
        try:
            headers = {'Authorization': f'user_token {self.user_token}'}
            if self.app_token:
                headers['App-Token'] = self.app_token
            resp = requests.get(
                f'{self.base_url}/initSession',
                headers=headers,
                timeout=5,
            )
            if resp.status_code == 200:
                self.session_token = resp.json().get('session_token')
                return True
        except requests.RequestException:
            pass
        return False

    def _kill_session(self):
        """Close the GLPI session."""
        if not self.session_token:
            return
        try:
            requests.get(
                f'{self.base_url}/killSession',
                headers=self._headers(),
                timeout=5,
            )
        except requests.RequestException:
            pass
        self.session_token = None

    def _headers(self) -> dict:
        headers = {'Session-Token': self.session_token or ''}
        if self.app_token:
            headers['App-Token'] = self.app_token
        return headers

    def get_computers(self, limit: int = 50) -> list:
        """Get list of computers from GLPI."""
        if not self._init_session():
            return []
        try:
            resp = requests.get(
                f'{self.base_url}/Computer',
                headers=self._headers(),
                params={
                    'range': f'0-{limit - 1}',
                    'expand_dropdowns': 'true',
                },
                timeout=10,
            )
            if resp.status_code == 200:
                return resp.json()
            return []
        except requests.RequestException:
            return []
        finally:
            self._kill_session()

    def get_computer_by_name(self, name: str) -> Optional[dict]:
        """Search for a computer by hostname."""
        if not self._init_session():
            return None
        try:
            resp = requests.get(
                f'{self.base_url}/search/Computer',
                headers=self._headers(),
                params={
                    'criteria[0][field]': '1',      # name field
                    'criteria[0][searchtype]': 'contains',
                    'criteria[0][value]': name,
                    'forcedisplay[0]': '1',          # name
                    'forcedisplay[1]': '2',          # id
                    'forcedisplay[2]': '4',          # type
                    'forcedisplay[3]': '45',         # OS
                    'forcedisplay[4]': '31',         # status
                },
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json()
                items = data.get('data', [])
                if items:
                    return items[0] if isinstance(items, list) else items
            return None
        except requests.RequestException:
            return None
        finally:
            self._kill_session()

    def enrich_event_metadata(self, event_metadata: dict) -> dict:
        """Optionally enrich event metadata with GLPI asset info."""
        hostname = event_metadata.get('hostname') or event_metadata.get('agent_name')
        if not hostname:
            return event_metadata

        asset = self.get_computer_by_name(hostname)
        if asset:
            event_metadata['glpi_asset'] = asset

        return event_metadata


# Module-level singleton
glpi_client = GLPIClient()
