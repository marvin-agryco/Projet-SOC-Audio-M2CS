import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """Base configuration."""

    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Database
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "postgresql://soc_user:soc_password@localhost:5432/soc_dashboard",
    )

    # Redis
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # Celery
    CELERY_BROKER_URL = REDIS_URL
    CELERY_RESULT_BACKEND = REDIS_URL

    # SMTP for alerts
    SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
    SMTP_USER = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")

    # Alert settings
    ALERT_CHECK_INTERVAL = 10  # seconds

    # Wazuh SIEM API (for Playbook Active Response)
    WAZUH_API_URL = os.getenv("WAZUH_API_URL", "https://wazuh-manager:55000")
    WAZUH_API_USER = os.getenv("WAZUH_API_USER", "wazuh")
    WAZUH_API_PASSWORD = os.getenv("WAZUH_API_PASSWORD", "wazuh")

    # AI Triage
    OLLAMA_URL        = os.getenv("OLLAMA_URL", "http://ollama:11434")
    OLLAMA_MODEL      = os.getenv("OLLAMA_MODEL", "qwen2.5:1.5b")
    VT_API_KEY        = os.getenv("VT_API_KEY", "")
    ABUSEIPDB_API_KEY = os.getenv("ABUSEIPDB_API_KEY", "")


class DevelopmentConfig(Config):
    """Development configuration."""

    DEBUG = True
    SQLALCHEMY_ECHO = True


class TestingConfig(Config):
    """Testing configuration."""

    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    WTF_CSRF_ENABLED = False


class ProductionConfig(Config):
    """Production configuration."""

    DEBUG = False
    SQLALCHEMY_ECHO = False


config = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig,
}
