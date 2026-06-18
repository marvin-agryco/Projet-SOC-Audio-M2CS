from celery_app import celery
from app import create_app, db, socketio
from app.models import (
    AlertRule,
    AlertAction,
    Playbook,
    PlaybookTrigger,
    PlaybookStatus,
    PlaybookExecution,
    ExecutionStatus,
)
from app.services.alert_engine import AlertEngine
from app.services.notifications import (
    send_email_alert,
    send_webhook_alert,
    format_alert_message,
)
from app.services.playbook_runner import PlaybookRunner

# Create app context for tasks
app = create_app()


@celery.task
def run_playbook_step(execution_id: str, step_index: int):
    """Run a specific playbook step and schedule the next if needed."""
    with app.app_context():
        runner = PlaybookRunner(execution_id)
        result = runner.run_step(step_index)

        if result["status"] == "completed" and result["next_step"] is not None:
            # Schedule next step
            run_playbook_step.delay(execution_id, result["next_step"])

        return result


@celery.task
def evaluate_alerts():
    """
    Periodic task to evaluate all alert rules.
    Runs every ALERT_CHECK_INTERVAL seconds.
    """
    with app.app_context():
        engine = AlertEngine()
        triggered = engine.evaluate_all_rules()

        for alert in triggered:
            rule = alert["rule"]
            process_alert.delay(rule)

        return {"triggered_count": len(triggered)}


@celery.task
def process_alert(rule_dict: dict):
    """Process a triggered alert - send notifications."""
    with app.app_context():
        rule_id = rule_dict["id"]
        rule = AlertRule.query.get(rule_id)

        if not rule:
            return {"error": "Rule not found"}

        message = format_alert_message(rule_dict)

        # Emit WebSocket alert
        socketio.emit(
            "alert", {"type": "rule_triggered", "rule": rule_dict, "message": message}
        )

        # Send notification based on action type
        if rule.action == AlertAction.EMAIL:
            recipients = rule.action_config.get("recipients", [])
            if recipients:
                send_email_alert(recipients=recipients, subject=rule.name, body=message)

        elif rule.action == AlertAction.WEBHOOK:
            url = rule.action_config.get("url")
            if url:
                send_webhook_alert(url, {"alert": rule_dict, "message": message})

        # Check for associated playbooks
        playbooks = Playbook.query.filter(
            Playbook.status == PlaybookStatus.ACTIVE,
            Playbook.trigger == PlaybookTrigger.ALERT_RULE,
        ).all()

        triggered_playbooks = []
        for pb in playbooks:
            if pb.trigger_config and str(pb.trigger_config.get("rule_id")) == str(
                rule_id
            ):
                # Trigger playbook execution
                steps_data = []
                for step in pb.steps or []:
                    step_copy = dict(step)
                    step_copy["status"] = "pending"
                    step_copy["started_at"] = None
                    step_copy["completed_at"] = None
                    step_copy["result"] = None
                    steps_data.append(step_copy)

                execution = PlaybookExecution(
                    playbook_id=pb.id,
                    triggered_by_alert_id=rule.id,
                    started_by="system (alert rule)",
                    steps_data=steps_data,
                    status=ExecutionStatus.IN_PROGRESS,
                )
                db.session.add(execution)
                db.session.commit()

                # Start Celery task for the first step
                run_playbook_step.delay(str(execution.id), 0)
                triggered_playbooks.append(pb.name)

        return {
            "status": "processed",
            "rule": rule.name,
            "playbooks_triggered": triggered_playbooks,
        }


@celery.task
def cleanup_old_events(days: int = 90):
    """
    Cleanup task to remove old resolved events.
    Keeps events for specified number of days.
    """
    from datetime import datetime, timedelta
    from app.models import Event, EventStatus

    with app.app_context():
        cutoff = datetime.utcnow() - timedelta(days=days)

        deleted = Event.query.filter(
            Event.status == EventStatus.RESOLVED, Event.updated_at < cutoff
        ).delete()

        db.session.commit()

        return {"deleted_count": deleted}
