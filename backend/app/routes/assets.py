from datetime import datetime
from flask import Blueprint, jsonify, request
from app.services.glpi_service import glpi_client

assets_bp = Blueprint('assets', __name__)

# ── GLPI asset cache ──────────────────────────────────────────────────────────
# GLPI computers change rarely; caching for 5 minutes avoids 3 blocking HTTP
# calls (initSession + GET /Computer?range=0-499 + killSession) on every load.
_assets_cache: dict = {"data": None, "fetched_at": None}
_ASSETS_CACHE_TTL = 300  # seconds (5 minutes)


def _get_cached_computers():
    now = datetime.utcnow()
    if _assets_cache["fetched_at"] is not None:
        age = (now - _assets_cache["fetched_at"]).total_seconds()
        if age < _ASSETS_CACHE_TTL and _assets_cache["data"] is not None:
            return _assets_cache["data"], True  # (data, from_cache)
    computers = glpi_client.get_computers(limit=500)
    if computers:  # only update cache on success — don't cache empty failures
        _assets_cache["data"] = computers
        _assets_cache["fetched_at"] = now
    return computers, False


@assets_bp.route('/assets', methods=['GET'])
def list_assets():
    """List computers from GLPI (cached for 5 minutes)."""
    force_refresh = request.args.get('refresh') == '1'
    if force_refresh:
        _assets_cache["fetched_at"] = None  # invalidate cache
    computers, from_cache = _get_cached_computers()
    return jsonify({
        'assets': computers,
        'total': len(computers),
        'source': 'glpi',
        'cached': from_cache,
    })


@assets_bp.route('/assets/<name>', methods=['GET'])
def get_asset(name):
    """Search for a GLPI asset by hostname."""
    asset = glpi_client.get_computer_by_name(name)
    if not asset:
        return jsonify({'error': 'Asset not found', 'name': name}), 404
    return jsonify(asset)
