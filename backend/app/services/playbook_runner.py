from datetime import datetime
from flask import current_app
from app import db
from app.models import PlaybookExecution, ExecutionStatus
from app.services.notifications import send_email_alert, send_webhook_alert
from sqlalchemy.orm.attributes import flag_modified


class PlaybookRunner:
    """Service to execute playbook steps."""

    def __init__(self, execution_id: str):
        self.execution_id = execution_id

    def get_execution(self) -> PlaybookExecution:
        import uuid

        return PlaybookExecution.query.get(uuid.UUID(self.execution_id))

    def run_step(self, step_index: int) -> dict:
        """
        Executes a single step in the playbook and returns a result dict.
        Returns: {'status': 'completed'|'failed'|'skipped', 'result': 'string result', 'next_step': int or None}
        """
        execution = self.get_execution()
        if not execution:
            return {
                "status": "failed",
                "result": "Execution not found",
                "next_step": None,
            }

        if execution.status != ExecutionStatus.IN_PROGRESS:
            return {
                "status": "failed",
                "result": f"Execution is not in progress (status: {execution.status})",
                "next_step": None,
            }

        steps = execution.steps_data
        if not steps or step_index >= len(steps):
            return {"status": "completed", "result": "No more steps", "next_step": None}

        step = steps[step_index]

        # Mark as running
        self._update_step_status(execution, step_index, "running")

        step_type = step.get("type")
        config = step.get("config", {})
        name = step.get("name", f"Step {step_index + 1}")

        try:
            current_app.logger.info(
                f"Executing playbook {self.execution_id} step {step_index}: {name} ({step_type})"
            )

            if step_type == "action":
                result = self._execute_action(config, execution)
                status = "completed"
            elif step_type == "notification":
                result = self._execute_notification(config, execution)
                status = "completed"
            elif step_type == "condition":
                result = self._execute_condition(config)
                status = "completed"
            elif step_type == "manual":
                # Manual steps need human intervention. We pause execution here.
                # Must change it back to pending
                self._update_step_status(execution, step_index, "pending")
                return {
                    "status": "pending",
                    "result": "Waiting for manual approval",
                    "next_step": None,
                }
            else:
                result = f"Unknown step type: {step_type}"
                status = "failed"

        except Exception as e:
            current_app.logger.error(f"Error executing step {step_index}: {str(e)}")
            result = f"Error: {str(e)}"
            status = "failed"

        # Mark step as finished
        self._update_step_status(execution, step_index, status, result)

        next_step_index = step_index + 1 if status == "completed" else None

        # Check if playbook is finished
        if next_step_index is None or next_step_index >= len(steps):
            self._finish_execution(execution, status)
            next_step_index = None

        return {"status": status, "result": result, "next_step": next_step_index}

    def _execute_action(self, config: dict, execution: PlaybookExecution) -> str:
        """Execute an automated action via Wazuh API."""
        action_type = config.get("action_type", "unknown")
        target = config.get("target", "")

        # Support basic template replacement for target (e.g. {{event.src_ip}})
        # In a fully fleshed out system, this would be a real templating engine.
        if target.startswith("{{") and target.endswith("}}"):
            target_var = target[2:-2].strip()
            if target_var == "event.src_ip" and execution.triggered_by_event_id:
                from app.models import Event

                event = Event.query.get(execution.triggered_by_event_id)
                if event and "src_ip" in event.event_metadata:
                    target = event.event_metadata["src_ip"]
            elif target_var == "alert.src_ip" and execution.triggered_by_alert_id:
                # If triggered by alert, find the corresponding event representing the alert
                from app.models import Event

                alert_event = Event.query.get(execution.triggered_by_alert_id)
                if alert_event and "src_ip" in alert_event.event_metadata:
                    target = alert_event.event_metadata["src_ip"]
                else:
                    raise ValueError(
                        f"Target {{alert.src_ip}} could not be resolved from alert {execution.triggered_by_alert_id}"
                    )

        if target.startswith("{{") and target.endswith("}}"):
            raise ValueError(f"Could not resolve dynamic target variable: {target}")

        current_app.logger.info(f"Executing action {action_type} on target {target}")

        if action_type == "block_ip":
            if not target or target == "unknown":
                raise ValueError("Cannot block IP without a valid target IP")

            from app.services.wazuh_api import WazuhAPI

            wazuh = WazuhAPI()

            # Use Wazuh firewall-drop active response
            # Note: The agent must be configured to accept this command. In our lab, the firewall-gw is.
            # Usually we'd send it to a specific firewall agent, or 'all'. Let's send to all for the demo.
            result = wazuh.execute_active_response(
                command="firewall-drop", arguments=target, agent_list=["all"]
            )

            if result and not result.get("error"):
                return f"Successfully executed action: {action_type} on {target} via Wazuh API"
            else:
                error_msg = (
                    result.get("message", "Unknown API error")
                    if result
                    else "API request failed"
                )
                raise Exception(f"Wazuh API Error: {error_msg}")

        # Fallback for other mock actions
        return f"Successfully executed mocked action: {action_type} on {target}"

    def _execute_notification(self, config: dict, execution: PlaybookExecution) -> str:
        """Send a notification using existing notification service."""
        notification_type = config.get("notification_type", "email")
        message = config.get("message", "Playbook notification")

        playbook_name = (
            execution.playbook.name if execution.playbook else "Unknown Playbook"
        )
        subject = f"[SOC Playbook] {playbook_name} Notification"

        if notification_type == "email":
            recipients = config.get("recipients", [])
            if recipients:
                success = send_email_alert(recipients, subject, message)
                return "Email sent successfully" if success else "Failed to send email"
            return "No recipients specified for email notification"

        elif notification_type == "webhook":
            url = config.get("url")
            if url:
                payload = {
                    "playbook_execution_id": str(execution.id),
                    "message": message,
                    "status": "notification_step",
                }
                success = send_webhook_alert(url, payload)
                return (
                    "Webhook triggered successfully"
                    if success
                    else "Failed to trigger webhook"
                )
            return "No URL specified for webhook notification"

        return f"Unknown notification type: {notification_type}"

    def _execute_condition(self, config: dict) -> str:
        """Evaluate a condition."""
        # Simple mock condition evaluation
        condition = config.get("condition", "unknown")
        return f"Condition '{condition}' evaluated to True"

    def _update_step_status(
        self,
        execution: PlaybookExecution,
        step_index: int,
        status: str,
        result: str = None,
    ):
        """Update step status and save to DB."""
        execution.update_step(step_index, status, result)
        db.session.commit()

        # Emit WebSocket event for real-time UI updates
        from app import socketio

        socketio.emit("playbook_execution_update", execution.to_dict())

    def _finish_execution(self, execution: PlaybookExecution, final_step_status: str):
        """Mark the entire execution as finished."""
        if final_step_status == "failed":
            execution.status = ExecutionStatus.FAILED
        elif final_step_status == "skipped":
            # If last step was skipped but others were completed, it's completed
            execution.status = ExecutionStatus.COMPLETED
        else:
            execution.status = ExecutionStatus.COMPLETED

        execution.completed_at = datetime.utcnow()
        db.session.commit()

        from app import socketio

        socketio.emit("playbook_execution_update", execution.to_dict())
