"""Unit tests for triage_service.py — pure functions, no DB or network."""

import json
import pytest
from unittest.mock import patch, MagicMock

from app.services.triage_service import (
    extract_ips,
    enrich_ip,
    enrich_ips,
    build_triage_prompt,
    parse_llm_response,
    build_explain_prompt,
    _is_private,
    STRICT_JSON_PREFIX,
)


# ── _is_private ───────────────────────────────────────────────────────────────

def test_is_private_loopback():
    assert _is_private("127.0.0.1") is True

def test_is_private_rfc1918_10():
    assert _is_private("10.0.0.1") is True

def test_is_private_rfc1918_172():
    assert _is_private("172.20.5.1") is True  # 172.16-31 range

def test_is_private_rfc1918_192():
    assert _is_private("192.168.1.1") is True

def test_is_private_link_local():
    assert _is_private("169.254.1.1") is True

def test_is_private_public():
    assert _is_private("8.8.8.8") is False

def test_is_private_malformed():
    assert _is_private("not-an-ip") is True  # malformed → treat as private


# ── extract_ips ───────────────────────────────────────────────────────────────

def test_extract_ips_happy_path():
    events = [
        {"metadata": {"source_ip": "185.1.2.3"}},
        {"metadata": {"source_ip": "203.4.5.6"}},
    ]
    assert extract_ips(events) == ["185.1.2.3", "203.4.5.6"]

def test_extract_ips_private_ips_excluded():
    events = [
        {"metadata": {"source_ip": "10.0.0.1"}},
        {"metadata": {"source_ip": "185.1.2.3"}},
        {"metadata": {"source_ip": "192.168.1.1"}},
    ]
    assert extract_ips(events) == ["185.1.2.3"]

def test_extract_ips_deduplication_caps_at_3():
    events = [
        {"metadata": {"source_ip": "1.1.1.1"}},
        {"metadata": {"source_ip": "1.1.1.1"}},  # duplicate
        {"metadata": {"source_ip": "2.2.2.2"}},
        {"metadata": {"source_ip": "3.3.3.3"}},
        {"metadata": {"source_ip": "4.4.4.4"}},  # over cap
    ]
    result = extract_ips(events)
    assert result == ["1.1.1.1", "2.2.2.2", "3.3.3.3"]
    assert len(result) == 3

def test_extract_ips_empty_metadata_returns_empty():
    events = [
        {"metadata": {}},
        {"metadata": None},
        {},
    ]
    assert extract_ips(events) == []

def test_extract_ips_empty_list():
    assert extract_ips([]) == []


# ── parse_llm_response ────────────────────────────────────────────────────────

def test_parse_llm_response_valid_json():
    raw = json.dumps({
        "threat_hypothesis":  "Brute force attack",
        "confidence":         80,
        "mitre_tactics":      ["T1110"],
        "recommended_action": "Block IP",
    })
    result = parse_llm_response(raw)
    assert result["threat_hypothesis"] == "Brute force attack"
    assert result["confidence"] == 80
    assert result["mitre_tactics"] == ["T1110"]

def test_parse_llm_response_missing_keys_uses_defaults():
    raw = json.dumps({"confidence": 50})
    result = parse_llm_response(raw)
    assert result["threat_hypothesis"] == "Unable to determine threat hypothesis."
    assert result["recommended_action"] == "Investigate manually."
    assert result["mitre_tactics"] == []

def test_parse_llm_response_invalid_json_raises():
    with pytest.raises(json.JSONDecodeError):
        parse_llm_response("not valid json")

def test_parse_llm_response_confidence_clamped_above():
    raw = json.dumps({"confidence": 150})
    result = parse_llm_response(raw)
    assert result["confidence"] == 100

def test_parse_llm_response_confidence_clamped_below():
    raw = json.dumps({"confidence": -10})
    result = parse_llm_response(raw)
    assert result["confidence"] == 0

def test_parse_llm_response_confidence_string_type():
    raw = json.dumps({"confidence": "75"})
    result = parse_llm_response(raw)
    assert result["confidence"] == 75

def test_parse_llm_response_confidence_invalid_type():
    raw = json.dumps({"confidence": "not-a-number"})
    result = parse_llm_response(raw)
    assert result["confidence"] == 0

def test_parse_llm_response_strips_markdown_fences():
    raw = "```json\n{\"confidence\": 70, \"mitre_tactics\": []}\n```"
    result = parse_llm_response(raw)
    assert result["confidence"] == 70

def test_parse_llm_response_mitre_tactics_capped_at_10():
    raw = json.dumps({"mitre_tactics": [f"T{i}" for i in range(15)]})
    result = parse_llm_response(raw)
    assert len(result["mitre_tactics"]) == 10

def test_parse_llm_response_mitre_tactics_not_list():
    raw = json.dumps({"mitre_tactics": "T1110"})
    result = parse_llm_response(raw)
    assert result["mitre_tactics"] == []


# ── build_triage_prompt ───────────────────────────────────────────────────────

def _mock_incident(title="Test Incident", severity="high", description=None):
    inc = MagicMock()
    inc.title = title
    inc.severity.value = severity
    inc.description = description
    return inc

def _mock_event(event_type="ssh_brute_force", severity="high", description="Login attempt", timestamp="2026-03-14T12:00:00Z"):
    e = MagicMock()
    e.to_dict.return_value = {
        "event_type":  event_type,
        "severity":    severity,
        "description": description,
        "timestamp":   timestamp,
    }
    return e

def test_build_prompt_contains_untrusted_delimiter():
    incident = _mock_incident()
    events   = [_mock_event()]
    prompt   = build_triage_prompt(incident, events, {})
    assert "[UNTRUSTED LOG DATA" in prompt
    assert "[END UNTRUSTED LOG DATA]" in prompt

def test_build_prompt_contains_incident_title():
    incident = _mock_incident(title="SSH Brute Force on GLPI")
    prompt   = build_triage_prompt(incident, [], {})
    assert "SSH Brute Force on GLPI" in prompt

def test_build_prompt_without_enrichment_still_valid():
    incident = _mock_incident()
    prompt   = build_triage_prompt(incident, [], {})
    assert "No IP enrichment data available." in prompt

def test_build_prompt_with_enrichment():
    enrichment = {"185.1.2.3": {"virustotal": {"malicious": 5, "suspicious": 2, "total": 90}}}
    incident   = _mock_incident()
    prompt     = build_triage_prompt(incident, [], enrichment)
    assert "185.1.2.3" in prompt
    assert "VT=5/90" in prompt

def test_build_prompt_no_events_placeholder():
    incident = _mock_incident()
    prompt   = build_triage_prompt(incident, [], {})
    assert "No events linked." in prompt


# ── enrich_ips (parallel) ─────────────────────────────────────────────────────

def test_enrich_ips_empty_list():
    assert enrich_ips([], "vt_key", "abuse_key") == {}

def test_enrich_ips_returns_dict_keyed_by_ip():
    with patch("app.services.triage_service.enrich_ip", return_value={"virustotal": {"malicious": 0}}) as mock_enrich:
        result = enrich_ips(["1.1.1.1", "2.2.2.2"], "vt", "abuse")
    assert "1.1.1.1" in result
    assert "2.2.2.2" in result
    assert mock_enrich.call_count == 2

def test_enrich_ip_skips_vt_when_no_key():
    with patch("app.services.triage_service._enrich_vt") as mock_vt, \
         patch("app.services.triage_service._enrich_abuseipdb") as mock_abuse:
        mock_abuse.return_value = {"score": 0}
        result = enrich_ip("1.1.1.1", vt_key="", abuse_key="key")
    mock_vt.assert_not_called()
    assert "abuseipdb" in result

def test_enrich_ip_returns_empty_on_api_error():
    with patch("app.services.triage_service._enrich_vt", side_effect=Exception("timeout")), \
         patch("app.services.triage_service._enrich_abuseipdb", side_effect=Exception("timeout")):
        result = enrich_ip("1.1.1.1", vt_key="key", abuse_key="key")
    assert result == {}


# ── build_explain_prompt ───────────────────────────────────────────────────────

def test_build_explain_prompt_includes_source_event_type_and_log():
    event = {'raw_log': 'SRC=1.2.3.4 DPT=22', 'source': 'firewall', 'event_type': 'port_scan', 'description': None}
    prompt = build_explain_prompt(event)
    assert 'firewall' in prompt
    assert 'port_scan' in prompt
    assert 'SRC=1.2.3.4 DPT=22' in prompt
    assert 'UNTRUSTED LOG DATA' in prompt

def test_build_explain_prompt_falls_back_to_description_when_no_raw_log():
    event = {'raw_log': None, 'description': 'Brute force attempt', 'source': 'endpoint', 'event_type': 'auth_failure'}
    prompt = build_explain_prompt(event)
    assert 'Brute force attempt' in prompt
    assert 'endpoint' in prompt

def test_build_explain_prompt_truncates_long_raw_log():
    event = {'raw_log': 'X' * 2000, 'source': 'ids', 'event_type': 'alert', 'description': None}
    prompt = build_explain_prompt(event)
    # Should only contain 1000 Xs, not 2000
    assert 'X' * 1000 in prompt
    assert 'X' * 1001 not in prompt


# ── STRICT_JSON_PREFIX ────────────────────────────────────────────────────────

def test_strict_json_prefix_exists():
    assert len(STRICT_JSON_PREFIX) > 0
    assert "JSON" in STRICT_JSON_PREFIX
