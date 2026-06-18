import pytest
from app.services.playbook_runner import PlaybookRunner
from app.models import (
    Playbook,
    PlaybookExecution,
    ExecutionStatus,
    PlaybookStatus,
    PlaybookTrigger,
    PlaybookCategory,
)


def test_playbook_runner_single_step(app, init_database):
    """Test executing a single action step in a playbook."""
    with app.app_context():
        # Setup playbook
        playbook = Playbook(
            name="Test Action Playbook",
            status=PlaybookStatus.ACTIVE,
            trigger=PlaybookTrigger.MANUAL,
            category=PlaybookCategory.INCIDENT,
            steps=[
                {
                    "id": "step1",
                    "type": "action",
                    "name": "Block IP",
                    "config": {"action_type": "block_ip", "target": "192.168.1.100"},
                }
            ],
        )
        init_database.session.add(playbook)
        init_database.session.commit()

        # Setup execution
        steps_data = []
        for step in playbook.steps:
            step_copy = dict(step)
            step_copy["status"] = "pending"
            step_copy["started_at"] = None
            step_copy["completed_at"] = None
            step_copy["result"] = None
            steps_data.append(step_copy)

        execution = PlaybookExecution(
            playbook_id=playbook.id,
            started_by="tester",
            steps_data=steps_data,
            status=ExecutionStatus.IN_PROGRESS,
        )
        init_database.session.add(execution)
        init_database.session.commit()

        # Run step (Mock Wazuh API to succeed)
        runner = PlaybookRunner(str(execution.id))

        # Patch WazuhAPI for this test
        import unittest.mock

        with unittest.mock.patch(
            "app.services.wazuh_api.WazuhAPI.execute_active_response"
        ) as mock_wazuh:
            mock_wazuh.return_value = {"error": 0, "message": "Success"}
            result = runner.run_step(0)

        assert result["status"] == "completed"
        assert result["next_step"] is None  # Only 1 step, so next is None
        assert (
            "Successfully executed action: block_ip on 192.168.1.100"
            in result["result"]
        )

        # Refresh execution to check DB state
        init_database.session.refresh(execution)
        assert execution.status == ExecutionStatus.COMPLETED
        assert execution.steps_data[0]["status"] == "completed"
        assert execution.steps_data[0]["completed_at"] is not None


def test_playbook_runner_manual_step(app, init_database):
    """Test that a manual step pauses execution."""
    with app.app_context():
        playbook = Playbook(
            name="Test Manual Playbook",
            status=PlaybookStatus.ACTIVE,
            trigger=PlaybookTrigger.MANUAL,
            category=PlaybookCategory.INCIDENT,
            steps=[
                {
                    "id": "step1",
                    "type": "manual",
                    "name": "Require Approval",
                    "config": {},
                },
                {
                    "id": "step2",
                    "type": "action",
                    "name": "Block IP",
                    "config": {"action_type": "block_ip"},
                },
            ],
        )
        init_database.session.add(playbook)
        init_database.session.commit()

        steps_data = []
        for step in playbook.steps:
            step_copy = dict(step)
            step_copy["status"] = "pending"
            steps_data.append(step_copy)

        execution = PlaybookExecution(
            playbook_id=playbook.id,
            started_by="tester",
            steps_data=steps_data,
            status=ExecutionStatus.IN_PROGRESS,
        )
        init_database.session.add(execution)
        init_database.session.commit()

        # Run step 0
        runner = PlaybookRunner(str(execution.id))
        result = runner.run_step(0)

        # Should be 'pending' (paused for approval)
        assert result["status"] == "pending"
        assert result["next_step"] is None

        init_database.session.refresh(execution)
        assert execution.status == ExecutionStatus.IN_PROGRESS
        assert execution.steps_data[0]["status"] == "pending"
        assert execution.steps_data[1]["status"] == "pending"
