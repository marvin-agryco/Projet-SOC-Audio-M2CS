from flask import Blueprint, request, jsonify
from datetime import datetime
from sqlalchemy.orm.attributes import flag_modified
from app import db
from app.models.playbook import (
    Playbook,
    PlaybookExecution,
    PlaybookStatus,
    PlaybookTrigger,
    PlaybookCategory,
    ExecutionStatus,
)

playbooks_bp = Blueprint("playbooks", __name__)


def _update_avg_duration(execution):
    """Recompute playbook.avg_duration_seconds using incremental running average."""
    pb = execution.playbook
    if not execution.completed_at or not execution.started_at:
        return
    duration = (execution.completed_at - execution.started_at).total_seconds()
    count = pb.run_count or 1
    if pb.avg_duration_seconds is None:
        pb.avg_duration_seconds = duration
    else:
        # Incremental average: new_avg = old_avg + (new_val - old_avg) / count
        pb.avg_duration_seconds = pb.avg_duration_seconds + (duration - pb.avg_duration_seconds) / count


# ============== PLAYBOOK CRUD ==============


@playbooks_bp.route("/playbooks", methods=["GET"])
def list_playbooks():
    """List all playbooks with optional filters."""
    query = Playbook.query

    status = request.args.get("status")
    if status:
        try:
            query = query.filter(Playbook.status == PlaybookStatus(status))
        except ValueError:
            pass

    category = request.args.get("category")
    if category:
        try:
            query = query.filter(Playbook.category == PlaybookCategory(category))
        except ValueError:
            pass

    playbooks = query.order_by(Playbook.created_at.desc()).all()
    return jsonify(
        {"playbooks": [p.to_dict() for p in playbooks], "total": len(playbooks)}
    )


@playbooks_bp.route("/playbooks/<uuid:playbook_id>", methods=["GET"])
def get_playbook(playbook_id):
    """Get a single playbook."""
    playbook = Playbook.query.get_or_404(playbook_id)
    return jsonify(playbook.to_dict())


@playbooks_bp.route("/playbooks", methods=["POST"])
def create_playbook():
    """Create a new playbook."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON payload provided"}), 400
    if "name" not in data:
        return jsonify({"error": "Missing required field: name"}), 400

    # Validate enums
    trigger = data.get("trigger", "manual")
    try:
        trigger_enum = PlaybookTrigger(trigger)
    except ValueError:
        return jsonify({"error": f"Invalid trigger: {trigger}"}), 400

    category = data.get("category", "incident")
    try:
        category_enum = PlaybookCategory(category)
    except ValueError:
        return jsonify({"error": f"Invalid category: {category}"}), 400

    playbook = Playbook(
        name=data["name"],
        description=data.get("description", ""),
        status=PlaybookStatus.DRAFT,
        trigger=trigger_enum,
        trigger_config=data.get("triggerConfig", {}),
        category=category_enum,
        steps=data.get("steps", []),
    )
    db.session.add(playbook)
    db.session.commit()
    return jsonify(playbook.to_dict()), 201


@playbooks_bp.route("/playbooks/<uuid:playbook_id>", methods=["PATCH"])
def update_playbook(playbook_id):
    """Update a playbook."""
    playbook = Playbook.query.get_or_404(playbook_id)
    data = request.get_json()

    if "name" in data:
        playbook.name = data["name"]
    if "description" in data:
        playbook.description = data["description"]
    if "status" in data:
        try:
            playbook.status = PlaybookStatus(data["status"])
        except ValueError:
            return jsonify({"error": f"Invalid status: {data['status']}"}), 400
    if "trigger" in data:
        try:
            playbook.trigger = PlaybookTrigger(data["trigger"])
        except ValueError:
            return jsonify({"error": f"Invalid trigger: {data['trigger']}"}), 400
    if "triggerConfig" in data:
        playbook.trigger_config = data["triggerConfig"]
    if "category" in data:
        try:
            playbook.category = PlaybookCategory(data["category"])
        except ValueError:
            return jsonify({"error": f"Invalid category: {data['category']}"}), 400
    if "steps" in data:
        playbook.steps = data["steps"]
        flag_modified(playbook, "steps")

    db.session.commit()
    return jsonify(playbook.to_dict())


@playbooks_bp.route("/playbooks/<uuid:playbook_id>", methods=["DELETE"])
def delete_playbook(playbook_id):
    """Delete a playbook and its executions."""
    playbook = Playbook.query.get_or_404(playbook_id)
    # Delete all executions first
    PlaybookExecution.query.filter_by(playbook_id=playbook_id).delete()
    db.session.delete(playbook)
    db.session.commit()
    return "", 204


@playbooks_bp.route("/playbooks/<uuid:playbook_id>/duplicate", methods=["POST"])
def duplicate_playbook(playbook_id):
    """Duplicate a playbook as a new draft."""
    original = Playbook.query.get_or_404(playbook_id)

    # Clean steps (remove any execution status)
    clean_steps = []
    for step in original.steps or []:
        clean = {
            k: v
            for k, v in step.items()
            if k not in ("status", "started_at", "completed_at", "result")
        }
        clean_steps.append(clean)

    copy = Playbook(
        name=f"{original.name} (Copy)",
        description=original.description,
        status=PlaybookStatus.DRAFT,
        trigger=original.trigger,
        trigger_config=original.trigger_config,
        category=original.category,
        steps=clean_steps,
    )
    db.session.add(copy)
    db.session.commit()
    return jsonify(copy.to_dict()), 201


@playbooks_bp.route("/playbooks/<uuid:playbook_id>/toggle", methods=["POST"])
def toggle_playbook(playbook_id):
    """Toggle playbook between active and draft."""
    playbook = Playbook.query.get_or_404(playbook_id)
    if playbook.status == PlaybookStatus.ACTIVE:
        playbook.status = PlaybookStatus.DRAFT
    else:
        playbook.status = PlaybookStatus.ACTIVE
    db.session.commit()
    return jsonify(playbook.to_dict())


@playbooks_bp.route("/playbooks/<uuid:playbook_id>/archive", methods=["POST"])
def archive_playbook(playbook_id):
    """Archive a playbook."""
    playbook = Playbook.query.get_or_404(playbook_id)
    playbook.status = PlaybookStatus.ARCHIVED
    db.session.commit()
    return jsonify(playbook.to_dict())


# ============== PLAYBOOK EXECUTION ==============


@playbooks_bp.route("/playbooks/<uuid:playbook_id>/execute", methods=["POST"])
def execute_playbook(playbook_id):
    """Start a new execution of a playbook."""
    playbook = Playbook.query.get_or_404(playbook_id)

    if playbook.status != PlaybookStatus.ACTIVE:
        return jsonify({"error": "Only active playbooks can be executed"}), 400

    data = request.get_json() or {}

    # Initialize steps_data with the playbook's steps template
    steps_data = []
    for step in playbook.steps or []:
        step_copy = dict(step)
        step_copy["status"] = "pending"
        step_copy["started_at"] = None
        step_copy["completed_at"] = None
        step_copy["result"] = None
        steps_data.append(step_copy)

    execution = PlaybookExecution(
        playbook_id=playbook.id,
        triggered_by_alert_id=data.get("alertId"),
        triggered_by_event_id=data.get("eventId"),
        started_by=data.get("startedBy", "analyst"),
        steps_data=steps_data,
        current_step=0,
    )
    # Update denormalized stats
    playbook.run_count = (playbook.run_count or 0) + 1
    playbook.last_run_at = datetime.utcnow()
    db.session.add(execution)
    db.session.commit()

    # Start Celery task for the first step
    from app.tasks import run_playbook_step

    run_playbook_step.delay(str(execution.id), 0)

    return jsonify(execution.to_dict()), 201


@playbooks_bp.route("/playbook-executions", methods=["GET"])
def list_executions():
    """List all playbook executions."""
    query = PlaybookExecution.query

    # Filter by status
    status = request.args.get("status")
    if status:
        try:
            query = query.filter(PlaybookExecution.status == ExecutionStatus(status))
        except ValueError:
            pass

    # Filter by playbook
    playbook_id = request.args.get("playbook_id")
    if playbook_id:
        query = query.filter(PlaybookExecution.playbook_id == playbook_id)

    # Only active (in_progress) executions
    active_only = request.args.get("active")
    if active_only == "true":
        query = query.filter(PlaybookExecution.status == ExecutionStatus.IN_PROGRESS)

    executions = query.order_by(PlaybookExecution.started_at.desc()).limit(100).all()
    return jsonify(
        {"executions": [e.to_dict() for e in executions], "total": len(executions)}
    )


@playbooks_bp.route("/playbook-executions/<uuid:execution_id>", methods=["GET"])
def get_execution(execution_id):
    """Get a single execution."""
    execution = PlaybookExecution.query.get_or_404(execution_id)
    return jsonify(execution.to_dict())


@playbooks_bp.route(
    "/playbook-executions/<uuid:execution_id>/steps/<int:step_index>", methods=["PATCH"]
)
def update_execution_step(execution_id, step_index):
    """Update a specific step in an execution."""
    execution = PlaybookExecution.query.get_or_404(execution_id)

    if execution.status != ExecutionStatus.IN_PROGRESS:
        return jsonify(
            {"error": "Cannot update steps on a completed/aborted execution"}
        ), 400

    data = request.get_json()
    if not data or "status" not in data:
        return jsonify({"error": "Missing status field"}), 400

    step_status = data["status"]
    if step_status not in ("pending", "running", "completed", "failed", "skipped"):
        return jsonify({"error": f"Invalid step status: {step_status}"}), 400

    execution.update_step(step_index, step_status, data.get("result"))

    # Check if all steps are done
    all_done = all(
        s.get("status") in ("completed", "failed", "skipped")
        for s in execution.steps_data
    )
    if all_done:
        execution.status = ExecutionStatus.COMPLETED
        execution.completed_at = datetime.utcnow()
        _update_avg_duration(execution)

    db.session.commit()
    return jsonify(execution.to_dict())


@playbooks_bp.route("/playbook-executions/<uuid:execution_id>/abort", methods=["POST"])
def abort_execution(execution_id):
    """Abort an in-progress execution."""
    execution = PlaybookExecution.query.get_or_404(execution_id)

    if execution.status != ExecutionStatus.IN_PROGRESS:
        return jsonify({"error": "Execution is not in progress"}), 400

    execution.status = ExecutionStatus.ABORTED
    execution.completed_at = datetime.utcnow()

    # Mark any pending steps as skipped
    for step in execution.steps_data or []:
        if step.get("status") == "pending":
            step["status"] = "skipped"
    flag_modified(execution, "steps_data")

    db.session.commit()
    return jsonify(execution.to_dict())


@playbooks_bp.route(
    "/playbook-executions/<uuid:execution_id>/complete", methods=["POST"]
)
def complete_execution(execution_id):
    """Mark an execution as complete (all steps done manually)."""
    execution = PlaybookExecution.query.get_or_404(execution_id)

    if execution.status != ExecutionStatus.IN_PROGRESS:
        return jsonify({"error": "Execution is not in progress"}), 400

    data = request.get_json() or {}

    execution.status = ExecutionStatus.COMPLETED
    execution.completed_at = datetime.utcnow()
    execution.result = data.get("result")
    _update_avg_duration(execution)

    db.session.commit()
    return jsonify(execution.to_dict())
