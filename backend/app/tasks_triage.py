"""Celery task for AI triage brief generation."""

import json
import logging
import time
import uuid as _uuid
from datetime import datetime

from celery_app import celery
from app import create_app, db, socketio
from app.models.triage import TriageBrief, TriageBriefStatus
from app.models.incident import Incident
from app.models.event import Event
from app.services.triage_service import (
    extract_ips,
    enrich_ips,
    build_triage_prompt,
    parse_llm_response,
    STRICT_JSON_PREFIX,
)

logger = logging.getLogger(__name__)

# App context for tasks (same pattern as tasks.py)
app = create_app()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fail(brief: TriageBrief, message: str) -> None:
    """Set brief status to FAILED with error message. Safe to call on DB errors."""
    try:
        brief.status = TriageBriefStatus.FAILED
        brief.error_message = message
        db.session.commit()
    except Exception:
        db.session.rollback()


def _call_ollama_with_retry(url: str, model: str, prompt: str) -> str:
    """POST to Ollama /api/chat with 3 retries on ConnectionError (2s/4s/8s backoff).

    Raises immediately on timeout or HTTP errors (non-recoverable).
    """
    import requests

    payload = {
        "model":    model,
        "messages": [{"role": "user", "content": prompt}],
        "stream":   False,
    }
    last_exc = None
    for attempt, delay in enumerate([0, 2, 4, 8]):
        if delay:
            time.sleep(delay)
        try:
            resp = requests.post(f"{url}/api/chat", json=payload, timeout=60)
            resp.raise_for_status()
            return resp.json()["message"]["content"]
        except requests.exceptions.ConnectionError as e:
            last_exc = e
            logger.warning(f"[triage] Ollama ConnectionError (attempt {attempt + 1}/4): {e}")
        except (requests.exceptions.Timeout, requests.exceptions.HTTPError):
            raise  # non-recoverable → propagate to outer handler

    raise last_exc  # all retries exhausted


# ── Task ──────────────────────────────────────────────────────────────────────

@celery.task
def run_triage(incident_id: str):
    """Generate AI triage brief for an incident.

    Flow:
        PENDING → GENERATING → (VT + AbuseIPDB + Ollama) → READY
                             └─────────────────────────→ FAILED (on any exception)
    """
    with app.app_context():
        try:
            incident_uuid = _uuid.UUID(incident_id)
        except (ValueError, AttributeError):
            logger.error(f"[triage] Invalid incident_id={incident_id!r}")
            return

        brief = TriageBrief.query.filter_by(
            incident_id=incident_uuid,
            status=TriageBriefStatus.PENDING,
        ).first()
        if not brief:
            return  # already processing or deleted

        brief.status = TriageBriefStatus.GENERATING
        db.session.commit()

        ollama_url = app.config.get("OLLAMA_URL", "http://ollama:11434")
        model      = app.config.get("OLLAMA_MODEL", "qwen2.5:1.5b")
        vt_key     = app.config.get("VT_API_KEY", "")
        abuse_key  = app.config.get("ABUSEIPDB_API_KEY", "")

        try:
            incident = Incident.query.get(incident_uuid)
            if not incident:
                _fail(brief, "Incident not found")
                socketio.emit("triage_update", {
                    "incident_id": incident_id,
                    "brief_id":    str(brief.id),
                    "status":      "failed",
                })
                return

            events = (
                incident.events
                .filter(Event.event_type != "keepalive")
                .limit(50)
                .all()
            )

            ips = extract_ips([e.to_dict() for e in events])
            enrichment = enrich_ips(ips, vt_key, abuse_key)
            brief.ip_enrichment = enrichment

            prompt = build_triage_prompt(incident, events, enrichment)
            t0 = time.time()
            raw = _call_ollama_with_retry(ollama_url, model, prompt)

            try:
                parsed = parse_llm_response(raw)
            except json.JSONDecodeError:
                logger.info(
                    f"[triage] JSON parse failed — retrying with strict prompt "
                    f"for incident={incident_id}"
                )
                raw2   = _call_ollama_with_retry(ollama_url, model, STRICT_JSON_PREFIX + prompt)
                parsed = parse_llm_response(raw2)  # raises → caught by outer except

            brief.threat_hypothesis  = parsed["threat_hypothesis"]
            brief.confidence         = parsed["confidence"]
            brief.mitre_tactics      = parsed["mitre_tactics"]
            brief.recommended_action = parsed["recommended_action"]
            brief.model_used         = model
            brief.generation_seconds = round(time.time() - t0, 1)
            brief.generated_at       = datetime.utcnow()
            brief.status             = TriageBriefStatus.READY
            db.session.commit()

            logger.info(
                f"[triage] Brief generated in {brief.generation_seconds}s, "
                f"confidence={brief.confidence}, incident={incident_id}"
            )
            socketio.emit("triage_update", {
                "incident_id": incident_id,
                "brief_id":    str(brief.id),
                "status":      "ready",
            })

        except Exception as e:
            logger.error(
                f"[triage] FAILED incident={incident_id}: {type(e).__name__}: {e}"
            )
            _fail(brief, f"{type(e).__name__}: {str(e)[:200]}")
            socketio.emit("triage_update", {
                "incident_id": incident_id,
                "brief_id":    str(brief.id),
                "status":      "failed",
            })
