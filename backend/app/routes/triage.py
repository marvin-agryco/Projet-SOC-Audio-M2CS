import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify
from app import db
from app.models.triage import TriageBrief, TriageBriefStatus

triage_bp = Blueprint('triage', __name__)

# Statuses where analyst actions (accept/edit/dismiss) are allowed
_ACTIONABLE_STATUSES = {
    TriageBriefStatus.READY,
    TriageBriefStatus.ACCEPTED,
    TriageBriefStatus.EDITED,
    TriageBriefStatus.DISMISSED,
    TriageBriefStatus.FAILED,
}


@triage_bp.route('/triage-briefs', methods=['GET'])
def get_triage_brief_for_incident():
    """Get the most recent triage brief for an incident."""
    incident_id_str = request.args.get('incident_id')
    if not incident_id_str:
        return jsonify({'error': 'incident_id query param required'}), 400
    try:
        incident_id = uuid.UUID(incident_id_str)
    except ValueError:
        return jsonify({'error': 'Invalid incident_id'}), 400

    brief = (
        TriageBrief.query
        .filter_by(incident_id=incident_id)
        .order_by(TriageBrief.created_at.desc())
        .first()
    )
    if not brief:
        return jsonify(None), 200  # no brief yet — frontend shows nothing

    return jsonify(brief.to_dict())


@triage_bp.route('/triage-briefs/<uuid:brief_id>', methods=['GET'])
def get_triage_brief(brief_id):
    brief = TriageBrief.query.get_or_404(brief_id)
    return jsonify(brief.to_dict())


@triage_bp.route('/triage-briefs/<uuid:brief_id>', methods=['PATCH'])
def update_triage_brief(brief_id):
    """Accept, edit, or dismiss a triage brief."""
    brief = TriageBrief.query.get_or_404(brief_id)

    if brief.status not in _ACTIONABLE_STATUSES:
        return jsonify({
            'error': f'Cannot update brief with status: {brief.status.value}'
        }), 400

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No JSON payload provided'}), 400

    action = data.get('action')
    if action not in ('accept', 'edit', 'dismiss'):
        return jsonify({'error': "action must be 'accept', 'edit', or 'dismiss'"}), 400

    action_to_status = {
        'accept':  TriageBriefStatus.ACCEPTED,
        'edit':    TriageBriefStatus.EDITED,
        'dismiss': TriageBriefStatus.DISMISSED,
    }

    brief.analyst_action = action
    brief.status         = action_to_status[action]
    brief.reviewed_at    = datetime.utcnow()

    if 'notes' in data:
        brief.analyst_notes = data['notes']
    if 'analyst' in data:
        brief.reviewed_by = data['analyst']

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Failed to update triage brief'}), 500

    return jsonify(brief.to_dict())


@triage_bp.route('/incidents/<uuid:incident_id>/retriage', methods=['POST'])
def retriage_incident(incident_id):
    """Trigger a new triage brief for an incident."""
    from app.models.incident import Incident

    # Verify incident exists
    Incident.query.get_or_404(incident_id)

    # Guard: refuse if another brief is already in flight
    in_flight = TriageBrief.query.filter(
        TriageBrief.incident_id == incident_id,
        TriageBrief.status.in_([TriageBriefStatus.PENDING, TriageBriefStatus.GENERATING]),
    ).first()
    if in_flight:
        return jsonify({
            'error': 'Triage already in progress',
            'brief': in_flight.to_dict(),
        }), 409

    brief = TriageBrief(incident_id=incident_id)
    db.session.add(brief)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Failed to create triage brief'}), 500

    from app.tasks_triage import run_triage
    run_triage.delay(str(incident_id))

    return jsonify(brief.to_dict()), 201
