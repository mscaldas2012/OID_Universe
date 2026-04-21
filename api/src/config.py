import re

from pydantic_settings import BaseSettings, SettingsConfigDict

_OID_PATTERN = re.compile(r"^\d+(\.\d+)*$")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    root_oid: str
    admin_api_key: str
    database_url: str

    def model_post_init(self, __context: object) -> None:
        if not _OID_PATTERN.match(self.root_oid):
            raise RuntimeError(
                f"ROOT_OID '{self.root_oid}' is not a valid dotted-integer OID"
            )


settings = Settings()  # type: ignore[call-arg]
