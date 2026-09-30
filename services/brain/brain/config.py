from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Any OpenAI-compatible server: Ollama in the stack or on a laptop, vLLM on a GPU box.
    llm_base_url: str = "http://localhost:11434/v1"
    llm_model: str = "mistral-nemo"
    llm_api_key: str = "not-needed"
    llm_timeout: float = 120
    llm_max_retries: int = 2

    api_key: str = ""         # if set, every request except /health needs header X-API-Key
    log_content: bool = False  # never log idea text unless this is true
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
