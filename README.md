# SOC Externalisé - Réseau Audioprothésistes

Plateforme de démonstration d'un SOC (Security Operations Center) externalisé pour un réseau de centres d'audioprothésistes en France.

## Contexte

| | |
|---|---|
| **Client** | Réseau de ~30 centres d'audioprothésistes en France, sans équipe sécurité interne |
| **Besoin** | Supervision centralisée de la sécurité informatique de l'ensemble des points de vente |
| **Solution** | SOC externalisé avec collecte multi-source (firewall, endpoints, GLPI), détection en temps réel via Wazuh SIEM, corrélation d'événements et réponse automatisée |
| **Projet** | Projet de fin d'année - M2 Cybersécurité, SDV Sup de Vinci (2026) |

## Architecture

![Architecture SOC](docs/architecture.svg)

## Fonctionnalités Clés

### Réponse Automatisée aux Incidents

Le SOC implémente une chaîne de réponse automatisée complète :

```
Wazuh Alert → Ingestion SOC → Règle d'Alerte → Playbook → Active Response Wazuh
```

Une alerte détectée par Wazuh est ingérée par le SOC, matchée par une règle d'alerte, déclenche un playbook de réponse, et ordonne à Wazuh de bloquer l'IP attaquante sur le firewall — sans intervention humaine.

### Moteur de Corrélation & Incidents

- Les règles d'alerte évaluent les événements en temps réel (seuil + fenêtre temporelle)
- Quand une règle se déclenche, un **Incident** est créé automatiquement avec les événements corrélés
- Déduplication : un incident ouvert par règle est réutilisé (pas de doublons)
- Cycle de vie complet : `new → open → investigating → resolved / false_positive`

### Assistant de Triage IA (v1.8)

À la création d'un incident, un agent IA analyse automatiquement le contexte :

```
Incident créé → Enrichissement IP (VT + AbuseIPDB) → LLM local (qwen2.5:1.5b via Ollama)
              → Hypothèse de menace + confiance + tactiques MITRE + action recommandée
              → Panneau TriageBrief dans le détail incident (WebSocket temps réel)
```

- **Enrichissement parallèle** des IPs sources via VirusTotal et AbuseIPDB (ThreadPoolExecutor)
- **Modèle local** Qwen2.5:1.5B via Ollama — aucune donnée envoyée vers des APIs cloud
- **Interface analyste** : jauge de confiance colorée, chips MITRE cliquables (→ attack.mitre.org), boutons Accepter / Modifier / Rejeter
- **Régénération** à tout moment — historique des briefs préservé

### Autres Fonctionnalités

- **Dashboard temps réel** avec WebSocket, KPI par sévérité, indicateurs de tendance (% vs J-1), sparklines
- **Analytics avancés** : heatmap d'activité V3 (calendrier réel, sévérité par cellule, click-to-filter), top source IPs avec actions OSINT (Whois, VirusTotal, Block), severity trend chart, donut interactif
- **4 sources d'événements** : Firewall, Endpoints, GLPI (application), Suricata IDS
- **Explication IA des logs bruts** : bouton "Explain this log" sur chaque événement → explication en langage naturel en ~4s (protection prompt injection via délimiteur `[UNTRUSTED LOG DATA]`)
- **Gestion des événements** avec filtres, recherche, assignation, groupement d'alertes, marquage faux positif rapide
- **Authentification JWT** avec rôles (admin, analyst, supervisor)
- **Interface bilingue** : toggle EN/FR en un clic, persisté en localStorage
- **Export** CSV, PDF, JSON
- **Playbooks** avec exécution étape par étape et intégration directe depuis les alertes
- **Infrastructure simulée** : Wazuh SIEM + endpoints + firewall + Suricata IDS + GLPI

## Stack Technique

| Composant | Technologie |
|-----------|-------------|
| Frontend | React 18, TypeScript, Tailwind CSS, Recharts |
| Backend | Python 3.11, Flask, SQLAlchemy, Flask-SocketIO |
| Database | PostgreSQL 15 |
| Task Queue | Celery + Redis |
| SIEM | Wazuh 4.14.2 (Manager, Indexer, Dashboard) |
| Endpoints | Ubuntu 22.04 + Wazuh Agent (conteneurs simulés) |
| CRM / Assets | GLPI + MariaDB 10.11 |
| LLM local | Ollama + Qwen2.5:1.5B |
| Conteneurisation | Docker, Docker Compose |

## Démarrage Rapide

### Prérequis

- Docker et Docker Compose
- Git

### Installation

```bash
# Cloner le projet
git clone https://github.com/arzak333/SOC-Project-SDV.git
cd SOC-Project-SDV

# Démarrer tous les services
docker compose up -d

# Initialiser la base de données et les utilisateurs de démo
docker compose exec backend python -c "from app import create_app, db, init_demo_users; app = create_app(); app.app_context().push(); db.create_all(); init_demo_users()"

# (Optionnel) Télécharger le modèle LLM pour le triage IA (~986 MB, une seule fois)
docker exec soc-ollama ollama pull qwen2.5:1.5b
```

### Accès

| Interface | URL | Identifiants |
|-----------|-----|-------------|
| SOC Dashboard | http://localhost:3000 | admin / admin123 |
| Backend API | http://localhost:5000 | — |

> Pour déployer l'infrastructure Wazuh et configurer GLPI, voir [infrastructure/README.md](infrastructure/README.md).

### Identifiants SOC

| Utilisateur | Mot de passe | Rôle |
|-------------|--------------|------|
| admin | admin123 | Administrateur |
| analyst | analyst123 | Analyste SOC |
| supervisor | supervisor123 | Superviseur |

### Générer des logs de test

```bash
pip install -r scripts/requirements.txt

python3 scripts/log_generator.py                                # Événements en continu
python3 scripts/log_generator.py --attack                       # Scénario d'attaque
python3 scripts/log_generator.py --burst --interval 1           # Mode burst (pics)
python3 scripts/log_generator.py --backfill                     # Historique 7 jours
python3 scripts/log_generator.py --backfill --days 30 --count 2000  # Historique personnalisé
```

## Documentation

| Document | Description |
|----------|-------------|
| [docs/reference.md](docs/reference.md) | Référence API complète (42 endpoints) |
| [docs/architecture.md](docs/architecture.md) | Architecture technique, schéma BDD, structure du projet |
| [docs/FEATURES.md](docs/FEATURES.md) | Inventaire complet des fonctionnalités par version |
| [infrastructure/README.md](infrastructure/README.md) | Déploiement infrastructure Wazuh + GLPI |

## Livrables du Projet

- [x] Analyse initiale
- [x] Document Architecture Technique
- [x] Démonstrateur opérationnel
- [x] Dashboards & alertes configurés
- [x] Playbooks / procédures
- [x] Moteur de corrélation et gestion des Incidents (v1.2)
- [x] Dashboard analytics avancés (v1.4)
- [x] Interface bilingue EN/FR (v1.6)
- [x] ActivityHeatmap V3 + StatCard Mission Critical + Suricata IDS (v1.7)
- [x] Assistant de Triage IA (v1.8) — LLM local Qwen2.5:1.5B, enrichissement IP, panneau interactif
- [x] Explication IA des logs bruts (v1.9.1) — bouton "Explain", protection prompt injection
- [x] Rapport technique complet
- [ ] Guide de déploiement & d'utilisation
- [ ] Vidéo de démonstration

## Équipe

- **Étudiant 1** : Ingénieur SIEM (déploiement, collecte, intégration)
- **Étudiant 2** : Analyste SOC (détection, dashboards, playbooks)
- **Étudiant 3** : Coordinateur (supervision, démo, documentation)

## Licence

Projet de fin d'année - SDV Sup de Vinci - M2 Cybersécurité 2026
