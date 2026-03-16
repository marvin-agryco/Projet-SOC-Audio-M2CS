from datetime import datetime
from flask import Blueprint, request, jsonify
from app import db
from app.models import Incident, IncidentStatus, IncidentSeverity, Event

incidents_bp = Blueprint("incidents", __name__)


@incidents_bp.route("/incidents", methods=["POST"])
def create_incident():
    """Create a new incident and fire AI triage."""
    from app.models.triage import TriageBrief

    data = request.get_json()
    if not data or 'title' not in data or 'severity' not in data:
        return jsonify({"error": "Missing required fields: title, severity"}), 400

    try:
        incident = Incident.from_dict(data)
        db.session.add(incident)
        db.session.flush()  # obtain incident.id before creating the brief
        brief = TriageBrief(incident_id=incident.id)
        db.session.add(brief)
        db.session.commit()
    except ValueError as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 400

    from app.tasks_triage import run_triage
    run_triage.delay(str(incident.id))

    return jsonify(incident.to_dict()), 201


@incidents_bp.route("/incidents", methods=["GET"])
def list_incidents():
    """List all incidents with optional filtering and pagination."""
    status = request.args.get("status")
    severity = request.args.get("severity")
    assigned_to = request.args.get("assigned_to")
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 20, type=int), 100)

    query = Incident.query

    if status:
        try:
            status_enum = IncidentStatus(status.lower())
            query = query.filter(Incident.status == status_enum)
        except ValueError:
            return jsonify({"error": f"Invalid status: {status}"}), 400

    if severity:
        try:
            severity_enum = IncidentSeverity(severity.lower())
            query = query.filter(Incident.severity == severity_enum)
        except ValueError:
            return jsonify({"error": f"Invalid severity: {severity}"}), 400

    if assigned_to:
        if assigned_to == "unassigned":
            query = query.filter(Incident.assigned_to.is_(None))
        else:
            query = query.filter(Incident.assigned_to == assigned_to)

    paginated = query.order_by(Incident.updated_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    return jsonify({
        "incidents": [i.to_dict() for i in paginated.items],
        "total": paginated.total,
        "pages": paginated.pages,
        "page": page,
    })


@incidents_bp.route("/incidents/<uuid:incident_id>", methods=["GET"])
def get_incident(incident_id):
    """Get a specific incident and its related events."""
    incident = Incident.query.get_or_404(incident_id)

    # Get up to 100 related events
    events = incident.events.order_by(Event.timestamp.desc()).limit(100).all()

    result = incident.to_dict()
    result["events"] = [e.to_dict() for e in events]

    return jsonify(result)


@incidents_bp.route("/incidents/<uuid:incident_id>", methods=["PATCH"])
def update_incident(incident_id):
    """Update an incident (status, assignment, etc)."""
    incident = Incident.query.get_or_404(incident_id)
    data = request.get_json()

    if not data:
        return jsonify({"error": "No JSON payload provided"}), 400

    if "status" in data:
        try:
            new_status = IncidentStatus(data["status"].lower())
            incident.status = new_status
            if new_status == IncidentStatus.RESOLVED:
                incident.resolved_at = datetime.utcnow()
            elif incident.resolved_at is not None:
                incident.resolved_at = None
        except ValueError:
            return jsonify({"error": f"Invalid status: {data['status']}"}), 400

    if "severity" in data:
        try:
            incident.severity = IncidentSeverity(data["severity"].lower())
        except ValueError:
            return jsonify({"error": f"Invalid severity: {data['severity']}"}), 400

    if "assigned_to" in data:
        incident.assigned_to = data["assigned_to"]

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        # Log error in a real app
        return jsonify({"error": "Failed to update incident"}), 500

    return jsonify(incident.to_dict())
