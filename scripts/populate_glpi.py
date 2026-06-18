#!/usr/bin/env python3
"""
Populate GLPI with 30 fictional French audio centers.

Creates / enriches:
  - 30 Locations
  - 205 Computers  (90% Windows 11 Pro / 10% macOS Sonoma, with manufacturer/type/state)
  - 97  Monitors
  - 45  Printers
  - 3   Software packages + license counts
  - 30  Network switches (Ubiquiti, 1 per center)
  - 43  Phones (Alcatel, 1-2 per center)

Usage:
  python3 scripts/populate_glpi.py           # create everything from scratch
  python3 scripts/populate_glpi.py --clean   # delete existing assets first, then create
  python3 scripts/populate_glpi.py --enrich  # only enrich existing computers + add SW/network/phones
"""

import argparse
import itertools
import random
import string
import sys
import requests

# ---------------------------------------------------------------------------
# GLPI API credentials (matches docker-compose.yml)
# ---------------------------------------------------------------------------
GLPI_URL = "http://localhost:8080/apirest.php"
APP_TOKEN = "b6W2NSYLqy3UF1spssoeQguYZcrVwNglT8QO0NoD"
USER_TOKEN = "iqtYcWdxtcO330aHP1pimDehAInS38k26RzhNLMY"

# ---------------------------------------------------------------------------
# Center definitions
# Tuple: (site_id, display_name, city_slug, pc_count, monitors, printers, phones)
#   phones: 2 for Paris/IDF, 1 for provincial
# ---------------------------------------------------------------------------
CENTERS = [
    # --- Paris (6 centers) ---
    ("AUDIO_Paris_Bastille",      "Centre Audio Paris Bastille",        "Paris-Bastille",      10, 5, 2, 2),
    ("AUDIO_Paris_Opera",         "Centre Audio Paris Opéra",           "Paris-Opera",         10, 5, 2, 2),
    ("AUDIO_Paris_Marais",        "Centre Audio Paris Marais",          "Paris-Marais",         9, 4, 2, 2),
    ("AUDIO_Paris_Montparnasse",  "Centre Audio Paris Montparnasse",    "Paris-Montparnasse",   9, 4, 2, 2),
    ("AUDIO_Paris_Nation",        "Centre Audio Paris Nation",          "Paris-Nation",         8, 4, 2, 2),
    ("AUDIO_Paris_Republique",    "Centre Audio Paris République",      "Paris-Republique",     8, 4, 2, 2),
    # --- Île-de-France (7 centers) ---
    ("AUDIO_Versailles",          "Centre Audio Versailles",            "Versailles",           7, 4, 2, 2),
    ("AUDIO_Boulogne",            "Centre Audio Boulogne-Billancourt",  "Boulogne",             7, 3, 2, 2),
    ("AUDIO_Nanterre",            "Centre Audio Nanterre",              "Nanterre",             7, 3, 2, 2),
    ("AUDIO_SaintDenis",          "Centre Audio Saint-Denis",           "Saint-Denis",          6, 3, 1, 2),
    ("AUDIO_Creteil",             "Centre Audio Créteil",               "Creteil",              6, 3, 1, 2),
    ("AUDIO_Argenteuil",          "Centre Audio Argenteuil",            "Argenteuil",           6, 3, 1, 2),
    ("AUDIO_Montreuil",           "Centre Audio Montreuil",             "Montreuil",            6, 3, 1, 2),
    # --- Lyon (2 centers) ---
    ("AUDIO_Lyon_PartDieu",       "Centre Audio Lyon Part-Dieu",        "Lyon-PartDieu",        8, 4, 2, 1),
    ("AUDIO_Lyon_Confluence",     "Centre Audio Lyon Confluence",       "Lyon-Confluence",      7, 3, 2, 1),
    # --- Marseille (2 centers) ---
    ("AUDIO_Marseille_VieuxPort", "Centre Audio Marseille Vieux-Port",  "Marseille-VieuxPort",  8, 4, 2, 1),
    ("AUDIO_Marseille_Castellane","Centre Audio Marseille Castellane",  "Marseille-Castellane", 7, 3, 2, 1),
    # --- Toulouse (2 centers) ---
    ("AUDIO_Toulouse_Capitole",   "Centre Audio Toulouse Capitole",     "Toulouse-Capitole",    7, 3, 2, 1),
    ("AUDIO_Toulouse_Blagnac",    "Centre Audio Toulouse Blagnac",      "Toulouse-Blagnac",     6, 3, 1, 1),
    # --- Bordeaux (2 centers) ---
    ("AUDIO_Bordeaux_Meriadeck",  "Centre Audio Bordeaux Mériadeck",    "Bordeaux-Meriadeck",   7, 3, 2, 1),
    ("AUDIO_Bordeaux_Chartrons",  "Centre Audio Bordeaux Chartrons",    "Bordeaux-Chartrons",   6, 3, 1, 1),
    # --- Single-center cities ---
    ("AUDIO_Nice",                "Centre Audio Nice Promenade",        "Nice",                 6, 3, 1, 1),
    ("AUDIO_Strasbourg",          "Centre Audio Strasbourg Grande Île", "Strasbourg",           6, 3, 1, 1),
    ("AUDIO_Nantes",              "Centre Audio Nantes Île de Nantes",  "Nantes",               6, 3, 1, 1),
    ("AUDIO_Montpellier",         "Centre Audio Montpellier Antigone",  "Montpellier",          6, 3, 1, 1),
    ("AUDIO_Lille",               "Centre Audio Lille Grand-Place",     "Lille",                6, 3, 1, 1),
    ("AUDIO_Rennes",              "Centre Audio Rennes République",     "Rennes",               5, 2, 1, 1),
    ("AUDIO_Grenoble",            "Centre Audio Grenoble Île Verte",    "Grenoble",             5, 2, 1, 1),
    ("AUDIO_Toulon",              "Centre Audio Toulon Mayol",          "Toulon",               5, 2, 1, 1),
    ("AUDIO_Clermont",            "Centre Audio Clermont-Ferrand Jaude","Clermont",             5, 2, 1, 1),
]

# ---------------------------------------------------------------------------
# Mac placement: (site_id, pc_number) — director's machine in 20 top centers
# ---------------------------------------------------------------------------
MAC_PCS = {
    ("AUDIO_Paris_Bastille",      10),
    ("AUDIO_Paris_Opera",         10),
    ("AUDIO_Paris_Marais",         9),
    ("AUDIO_Paris_Montparnasse",   9),
    ("AUDIO_Paris_Nation",         8),
    ("AUDIO_Paris_Republique",     8),
    ("AUDIO_Versailles",           7),
    ("AUDIO_Boulogne",             7),
    ("AUDIO_Nanterre",             7),
    ("AUDIO_Lyon_PartDieu",        8),
    ("AUDIO_Lyon_Confluence",      7),
    ("AUDIO_Marseille_VieuxPort",  8),
    ("AUDIO_Marseille_Castellane", 7),
    ("AUDIO_Toulouse_Capitole",    7),
    ("AUDIO_Bordeaux_Meriadeck",   7),
    ("AUDIO_Nice",                 6),
    ("AUDIO_Strasbourg",           6),
    ("AUDIO_Nantes",               6),
    ("AUDIO_Montpellier",          6),
    ("AUDIO_Lille",                6),
}

# Paris + IDF slugs (index 0-12 in CENTERS) for laptop ratio determination
PARIS_IDF_SLUGS = {c[2] for c in CENTERS[:13]}

# State distribution — deterministic: every 20th = En maintenance, every ~14th = Disponible
def _state_for_index(i):
    if i % 20 == 19:       return "En maintenance"
    if i % 14 == 13:       return "Disponible"
    return "En service"

# Windows manufacturer round-robin
_WIN_MFR_CYCLE = itertools.cycle(["Dell", "HP", "Lenovo"])


def gen_serial():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


class GLPIPopulator:
    def __init__(self):
        self.headers = {"App-Token": APP_TOKEN, "Content-Type": "application/json"}
        self.session_token = None
        # Reference IDs populated during setup
        self.mfr = {}      # name → id
        self.types = {}    # name → id
        self.states = {}   # name → id
        self.os_ids = {}   # name → id

    # ------------------------------------------------------------------
    # Session
    # ------------------------------------------------------------------
    def init_session(self):
        resp = requests.get(
            f"{GLPI_URL}/initSession",
            headers={**self.headers, "Authorization": f"user_token {USER_TOKEN}"},
            timeout=10,
        )
        if resp.status_code != 200:
            print(f"[ERROR] initSession failed: {resp.status_code} {resp.text}")
            sys.exit(1)
        self.session_token = resp.json()["session_token"]
        self.headers["Session-Token"] = self.session_token
        print(f"[OK] Session started: {self.session_token[:16]}...")

    def kill_session(self):
        requests.get(f"{GLPI_URL}/killSession", headers=self.headers, timeout=5)
        print("[OK] Session closed.")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _get_all(self, item_type):
        resp = requests.get(
            f"{GLPI_URL}/{item_type}",
            headers=self.headers,
            params={"range": "0-999", "expand_dropdowns": "false"},
            timeout=20,
        )
        if resp.status_code == 200:
            data = resp.json()
            return data if isinstance(data, list) else []
        return []

    def _delete_all(self, item_type):
        items = self._get_all(item_type)
        if not items:
            print(f"  [skip] No {item_type} to delete.")
            return
        count = 0
        for item in items:
            r = requests.delete(f"{GLPI_URL}/{item_type}/{item['id']}", headers=self.headers, timeout=10)
            if r.status_code == 200:
                count += 1
        print(f"  [OK] Deleted {count}/{len(items)} {item_type}(s)")

    def _create(self, item_type, payload):
        resp = requests.post(
            f"{GLPI_URL}/{item_type}",
            headers=self.headers,
            json={"input": payload},
            timeout=10,
        )
        if resp.status_code in (200, 201):
            data = resp.json()
            return data.get("id") if isinstance(data, dict) else None
        print(f"  [WARN] Failed to create {item_type}: {resp.status_code} {resp.text[:120]}")
        return None

    def _get_or_create(self, item_type, name):
        """Return existing id or create a new entry."""
        existing = {item["name"]: item["id"] for item in self._get_all(item_type)}
        if name in existing:
            return existing[name]
        return self._create(item_type, {"name": name})

    # ------------------------------------------------------------------
    # Reference data setup
    # ------------------------------------------------------------------
    def setup_reference_data(self):
        print("\n--- Setting up reference data ---")

        for name in ["Dell", "HP", "Lenovo", "Apple", "Canon", "Ubiquiti", "Alcatel"]:
            self.mfr[name] = self._get_or_create("Manufacturer", name)
        print(f"  [OK] Manufacturers: {list(self.mfr.keys())}")

        for name in ["Desktop", "Laptop"]:
            self.types[name] = self._get_or_create("ComputerType", name)
        print(f"  [OK] Computer types: {list(self.types.keys())}")

        for name in ["En service", "Disponible", "En maintenance"]:
            self.states[name] = self._get_or_create("State", name)
        print(f"  [OK] States: {list(self.states.keys())}")

        for name in ["Windows 11 Pro", "macOS Sonoma"]:
            self.os_ids[name] = self._get_or_create("OperatingSystem", name)
        print(f"  [OK] Operating systems: {list(self.os_ids.keys())}")

    # ------------------------------------------------------------------
    # Clean
    # ------------------------------------------------------------------
    def clean(self):
        print("\n--- Cleaning existing assets ---")
        for t in ["Computer", "Monitor", "Printer", "NetworkEquipment", "Phone",
                  "SoftwareLicense", "Software", "Location"]:
            self._delete_all(t)

    # ------------------------------------------------------------------
    # Create core assets
    # ------------------------------------------------------------------
    def create_locations(self):
        print("\n--- Creating 30 Locations ---")
        location_ids = {}
        for site_id, name, slug, *_ in CENTERS:
            loc_id = self._create("Location", {"name": name, "comment": site_id})
            if loc_id:
                location_ids[site_id] = loc_id
        print(f"  → {len(location_ids)}/30 locations created.")
        return location_ids

    def create_computers(self, location_ids):
        print("\n--- Creating Computers ---")
        total = macs = 0
        win_cycle = itertools.cycle(["Dell", "HP", "Lenovo"])
        global_idx = 0
        for site_id, name, slug, pc_count, _, _, _ in CENTERS:
            loc_id = location_ids.get(site_id, 0)
            is_paris_idf = slug in PARIS_IDF_SLUGS
            for n in range(1, pc_count + 1):
                is_mac = (site_id, n) in MAC_PCS
                # Manufacturer
                mfr_name = "Apple" if is_mac else next(win_cycle)
                # Type
                if is_mac:
                    ctype = "Laptop"
                elif is_paris_idf:
                    ctype = "Laptop" if n % 2 == 0 else "Desktop"
                else:
                    ctype = "Laptop" if n % 3 == 0 else "Desktop"
                # State
                state = _state_for_index(global_idx)
                os_name = "macOS Sonoma" if is_mac else "Windows 11 Pro"
                payload = {
                    "name": f"PC-{slug}-{n:02d}",
                    "serial": gen_serial(),
                    "comment": f"{name} | {site_id} | {'macOS' if is_mac else 'Windows'}",
                    "locations_id": loc_id,
                    "operatingsystems_id": self.os_ids.get(os_name, 0),
                    "manufacturers_id": self.mfr.get(mfr_name, 0),
                    "computertypes_id": self.types.get(ctype, 0),
                    "states_id": self.states.get(state, 0),
                }
                cid = self._create("Computer", payload)
                if cid:
                    total += 1
                    if is_mac:
                        macs += 1
                global_idx += 1
            print(f"  [OK] {slug}: {pc_count} computers")
        print(f"  → {total} computers | {macs} Mac | {total - macs} Windows")

    def create_monitors(self, location_ids):
        print("\n--- Creating Monitors ---")
        total = 0
        for site_id, name, slug, _, mon_count, _, _ in CENTERS:
            loc_id = location_ids.get(site_id, 0)
            for n in range(1, mon_count + 1):
                payload = {
                    "name": f"MON-{slug}-{n:02d}",
                    "serial": gen_serial(),
                    "comment": f"{name} | {site_id}",
                    "locations_id": loc_id,
                    "manufacturers_id": self.mfr.get("Dell", 0),
                }
                if self._create("Monitor", payload):
                    total += 1
        print(f"  → {total} monitors created.")

    def create_printers(self, location_ids):
        print("\n--- Creating Printers ---")
        total = 0
        for site_id, name, slug, _, _, prt_count, _ in CENTERS:
            loc_id = location_ids.get(site_id, 0)
            for n in range(1, prt_count + 1):
                payload = {
                    "name": f"PRT-{slug}-{n:02d}",
                    "serial": gen_serial(),
                    "comment": f"{name} | {site_id}",
                    "locations_id": loc_id,
                    "manufacturers_id": self.mfr.get("Canon", 0),
                }
                if self._create("Printer", payload):
                    total += 1
        print(f"  → {total} printers created.")

    # ------------------------------------------------------------------
    # Enrich: software, network, phones
    # ------------------------------------------------------------------
    def create_software(self):
        print("\n--- Creating Software & Licenses ---")
        packages = [
            ("Microsoft 365 Business", 205),
            ("ESET Endpoint Security",  185),
            ("Atelier Web Audiogram",    30),
        ]
        for sw_name, qty in packages:
            sw_id = self._create("Software", {"name": sw_name, "comment": "Licence groupe AudioSOC"})
            if sw_id:
                lic_id = self._create("SoftwareLicense", {
                    "softwares_id": sw_id,
                    "name": f"{sw_name} — {qty} postes",
                    "number": qty,
                })
                print(f"  [OK] {sw_name}: {qty} licences (sw={sw_id}, lic={lic_id})")

    def create_network_equipment(self, location_ids):
        print("\n--- Creating Network Switches (Ubiquiti, 1/center) ---")
        total = 0
        for site_id, name, slug, *_ in CENTERS:
            loc_id = location_ids.get(site_id, 0)
            payload = {
                "name": f"SW-{slug}-01",
                "serial": gen_serial(),
                "comment": f"{name} | {site_id} | UniFi Switch 24",
                "locations_id": loc_id,
                "manufacturers_id": self.mfr.get("Ubiquiti", 0),
            }
            if self._create("NetworkEquipment", payload):
                total += 1
        print(f"  → {total} switches created.")

    def create_phones(self, location_ids):
        print("\n--- Creating Phones (Alcatel) ---")
        total = 0
        for site_id, name, slug, _, _, _, phone_count in CENTERS:
            loc_id = location_ids.get(site_id, 0)
            for n in range(1, phone_count + 1):
                payload = {
                    "name": f"TEL-{slug}-{n:02d}",
                    "serial": gen_serial(),
                    "comment": f"{name} | {site_id} | Alcatel IP Touch",
                    "locations_id": loc_id,
                    "manufacturers_id": self.mfr.get("Alcatel", 0),
                }
                if self._create("Phone", payload):
                    total += 1
        print(f"  → {total} phones created.")

    # ------------------------------------------------------------------
    # Enrich-only mode: patch existing computers with manufacturer/type/state
    # ------------------------------------------------------------------
    def enrich_existing_computers(self):
        print("\n--- Enriching existing computers ---")
        computers = self._get_all("Computer")
        if not computers:
            print("  [skip] No computers found.")
            return
        win_cycle = itertools.cycle(["Dell", "HP", "Lenovo"])
        updated = 0
        for idx, comp in enumerate(computers):
            comment = comp.get("comment", "")
            is_mac = "macOS" in comment
            name = comp.get("name", "")
            # Derive slug from name: PC-{slug}-{nn} → split on '-', skip first part
            parts = name.split("-")
            slug = "-".join(parts[1:-1]) if len(parts) >= 3 else ""
            is_paris_idf = slug in PARIS_IDF_SLUGS
            n = int(parts[-1]) if parts[-1].isdigit() else 0

            mfr_name = "Apple" if is_mac else next(win_cycle)
            if is_mac:
                ctype = "Laptop"
            elif is_paris_idf:
                ctype = "Laptop" if n % 2 == 0 else "Desktop"
            else:
                ctype = "Laptop" if n % 3 == 0 else "Desktop"
            state = _state_for_index(idx)

            payload = {
                "manufacturers_id": self.mfr.get(mfr_name, 0),
                "computertypes_id": self.types.get(ctype, 0),
                "states_id": self.states.get(state, 0),
            }
            r = requests.put(
                f"{GLPI_URL}/Computer/{comp['id']}",
                headers=self.headers,
                json={"input": payload},
                timeout=10,
            )
            if r.status_code == 200:
                updated += 1
        print(f"  → {updated}/{len(computers)} computers enriched.")

    # ------------------------------------------------------------------
    # Entry points
    # ------------------------------------------------------------------
    def run(self, clean=False, enrich_only=False):
        self.init_session()
        try:
            self.setup_reference_data()

            if enrich_only:
                self.enrich_existing_computers()
                # Fetch existing location map from Location names
                locs = self._get_all("Location")
                location_ids = {}
                for loc in locs:
                    for site_id, name, *_ in CENTERS:
                        if loc["name"] == name:
                            location_ids[site_id] = loc["id"]
                self.create_software()
                self.create_network_equipment(location_ids)
                self.create_phones(location_ids)
            else:
                if clean:
                    self.clean()
                location_ids = self.create_locations()
                self.create_computers(location_ids)
                self.create_monitors(location_ids)
                self.create_printers(location_ids)
                self.create_software()
                self.create_network_equipment(location_ids)
                self.create_phones(location_ids)

            total_pc    = sum(c[3] for c in CENTERS)
            total_mon   = sum(c[4] for c in CENTERS)
            total_prt   = sum(c[5] for c in CENTERS)
            total_phone = sum(c[6] for c in CENTERS)
            print(f"\n=== Done ===")
            print(f"  30 centers | {total_pc} computers ({len(MAC_PCS)} Mac / {total_pc - len(MAC_PCS)} Win)"
                  f" | {total_mon} monitors | {total_prt} printers"
                  f" | 30 switches | {total_phone} phones | 3 software packages")
        finally:
            self.kill_session()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Populate GLPI with 30 French audio centers")
    parser.add_argument("--clean",  action="store_true", help="Delete existing assets before creating")
    parser.add_argument("--enrich", action="store_true", help="Only enrich existing computers + add SW/network/phones")
    args = parser.parse_args()

    GLPIPopulator().run(clean=args.clean, enrich_only=args.enrich)
