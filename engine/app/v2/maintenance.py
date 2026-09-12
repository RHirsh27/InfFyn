"""Run hourly from the approved engine scheduler after the retention policy is approved."""


def main():
    from app.config import settings

    if not settings.audit_v2_enabled or not settings.audit_retention_approved:
        raise SystemExit("Retention maintenance is disabled pending approval.")
    from supabase import create_client
    from .repository import AuditRepository

    AuditRepository(
        create_client(settings.supabase_url, settings.supabase_service_role_key)
    ).cleanup()
    if settings.monthly_enabled:
        from app.monthly.repository import MonthlyRepository

        MonthlyRepository(
            create_client(settings.supabase_url, settings.supabase_service_role_key)
        ).cleanup()
    print("Audit retention sweep completed; no customer payload logged.")


if __name__ == "__main__":
    main()
