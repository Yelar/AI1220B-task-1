from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Collaborative Document Editor API"
    api_prefix: str = "/api"
    database_url: str = "sqlite:///./data/app.db"
    frontend_origin: str = "http://localhost:3000"
    lm_studio_base_url: str = "http://127.0.0.1:1234"
    lm_studio_model: str = "local-model"
    lm_studio_timeout_seconds: float = 60.0
    llm_mock: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
