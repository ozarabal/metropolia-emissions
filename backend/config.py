from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./emissions.db"
    REDIS_URL: str = "redis://localhost:6377/0"
    API_SECRET_KEY: str = "dev-secret-change-in-production"
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "https://*.azurestaticapps.net",
    ]
    GCP_PROJECT_ID: str = ""
    BIGQUERY_DATASET: str = "metropolia_transport"

    model_config = SettingsConfigDict(
        env_file="../.env", 
        case_sensitive=True, 
        extra="ignore"
    )

settings = Settings()

print(f"CURRENT DATABASE_URL: {settings.DATABASE_URL}")