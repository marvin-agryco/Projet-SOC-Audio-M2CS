from celery import Celery
from config import Config

celery = Celery(
    'soc_dashboard',
    broker=Config.REDIS_URL,
    backend=Config.REDIS_URL,
    include=['app.tasks', 'app.tasks_triage']
)

celery.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    beat_schedule={
        'evaluate-alert-rules': {
            'task': 'app.tasks.evaluate_alerts',
            'schedule': Config.ALERT_CHECK_INTERVAL,
        },
    }
)

if __name__ == '__main__':
    celery.start()
