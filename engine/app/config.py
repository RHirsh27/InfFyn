from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    supabase_url: str
    supabase_service_role_key: str
    supabase_jwt_secret: str | None = None
    supabase_storage_bucket: str = "ingest"
    sentry_dsn: str | None = None

    # Stripe (engine-only secrets)
    # stripe_secret_key: the app developer's OWN account secret key (sk_test_… in
    #   test mode). Used ONLY to authenticate the OAuth token/refresh exchange
    #   (HTTP Basic). It is NOT used to read tenant data anymore — tenant reads use
    #   the per-tenant app access token obtained via refresh.
    stripe_secret_key: str | None = None
    # stripe_app_client_id: the Stripe App's OAuth client id, from the app's
    #   "External test" → Test OAuth link (marketplace.stripe.com/oauth/v2/authorize?client_id=…).
    stripe_app_client_id: str | None = None
    stripe_oauth_redirect_uri: str | None = None
    oauth_state_secret: str | None = None
    # stripe_token_enc_key: Fernet key (urlsafe base64, 32 bytes) used to encrypt
    #   the stored read-only refresh token at rest. Render env only; never in repo/DB.
    stripe_token_enc_key: str | None = None
    app_base_url: str = "http://localhost:3000"

    # Revised audit product. All provider credentials remain engine-side.
    audit_v2_enabled: bool = False
    audit_retention_approved: bool = False
    billing_enabled: bool = False
    billing_price_approved: bool = False
    billing_live_approved: bool = False
    stripe_billing_key: str | None = None
    stripe_billing_webhook_secret: str | None = None
    stripe_billing_price_id: str | None = None
    audit_proxy_secret: str | None = None
    # Dedicated hosted preview only. Still requires real JWT + tenant membership.
    inffyn_preview_mode: bool = False
    # Server-only admission list. Never published in status or browser bundles.
    inffyn_private_alpha: bool = False
    inffyn_alpha_user_ids: str = ""
    # Pin on alpha deployments so a lost enable flag cannot reopen standard routes.
    inffyn_release_stage: str = "standard"
    monthly_enabled: bool = False
    provider_token_enc_key: str | None = None
    openai_import_enabled: bool = False
    anthropic_import_enabled: bool = False
    stripe_import_enabled: bool = False
    maintenance_secret: str | None = None

    # Board Report LLM (engine-only secret). anthropic_model is the exact model id —
    # set it to the current Claude model you want the writer to use.
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-3-5-sonnet-latest"

    # Deprecated Connect OAuth fields — retained so existing env doesn't error
    # during the Stripe App migration; no longer read by the OAuth flow.
    stripe_connect_client_id: str | None = None
    stripe_oauth_client_secret: str | None = None

    @field_validator("inffyn_private_alpha", mode="before")
    @classmethod
    def strict_alpha_flag(cls, value):
        if isinstance(value, bool):
            return value
        if isinstance(value, str) and value.strip().lower() in ("", "false", "true"):
            return value.strip().lower() == "true"
        raise ValueError("INFFYN_PRIVATE_ALPHA must be true or false.")

    @field_validator("inffyn_release_stage", mode="before")
    @classmethod
    def strict_release_stage(cls, value):
        if isinstance(value, str) and value.strip().lower() in (
            "",
            "standard",
            "private_alpha",
        ):
            return value.strip().lower() or "standard"
        raise ValueError("INFFYN_RELEASE_STAGE must be standard or private_alpha.")


settings = Settings()
