from fastapi import FastAPI

from app.config import settings
from app.sentry import init_sentry

init_sentry()

app = FastAPI(title="InfFyn Engine")


@app.get("/health")
def health():
    return {"status": "ok"}


# Service-role Supabase client stub — no queries in E0
def get_supabase_client():
    from supabase import create_client

    return create_client(settings.supabase_url, settings.supabase_service_role_key)
