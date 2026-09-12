"""Private-alpha admission, direct-engine isolation and immutable report context.

All users, JWT signing keys, companies and evidence here are local test fixtures.
No provider or hosted database is used.
"""

import copy
import runpy
import sys
import time
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from app.auth import _current_alpha_account, verify_jwt
from app.config import Settings, settings
from app.main import app
from app.models import TenantContext
from app.monthly.contract import MonthlyInput
from app.monthly.economics import calculate_month
from app.private_alpha import alpha_user_ids, route_access
from app.v2.local_validation import TENANT, USER, LocalRepository
from app.v2.router import build_router
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from starlette.websockets import WebSocketDisconnect

from tests.test_auth import TEST_SECRET, USER_ID, make_token
from tests.test_monthly import WORKLOAD, body, definition

OTHER_USER = "77777777-7777-4777-8777-777777777777"


@pytest.fixture
def alpha(monkeypatch):
    monkeypatch.setattr(settings, "inffyn_private_alpha", True)
    monkeypatch.setattr(settings, "inffyn_alpha_user_ids", USER_ID)
    monkeypatch.setattr(settings, "supabase_jwt_secret", TEST_SECRET)
    monkeypatch.setattr(settings, "audit_v2_enabled", True)
    monkeypatch.setattr(settings, "audit_retention_approved", True)
    monkeypatch.setattr(settings, "monthly_enabled", True)
    monkeypatch.setattr(
        "app.auth._current_alpha_account",
        Mock(
            return_value=SimpleNamespace(
                id=USER_ID,
                email_confirmed_at="2026-09-01T00:00:00Z",
                is_anonymous=False,
            )
        ),
    )
    return TestClient(app)


def alpha_token(**kwargs):
    return make_token(role="authenticated", is_anonymous=False, **kwargs)


def test_alpha_requires_allowlisted_identity_after_signature(alpha):
    assert verify_jwt(alpha_token()) == USER_ID
    for token, expected in (
        (alpha_token(sub=OTHER_USER), 403),
        (alpha_token(_secret="test-forged-signature-at-least-32-characters"), 401),
        (alpha_token(exp=int(time.time()) - 60), 401),
        (alpha_token(iss="https://other.example/auth/v1"), 401),
        (alpha_token(aud="service_role"), 401),
        (
            alpha_token(sub=OTHER_USER, user_metadata={"sub": USER_ID, "alpha": True}),
            403,
        ),
    ):
        with pytest.raises(HTTPException) as error:
            verify_jwt(token)
        assert error.value.status_code == expected


@pytest.mark.parametrize(
    "current",
    [
        None,
        SimpleNamespace(
            id=USER_ID,
            email_confirmed_at=None,
            is_anonymous=False,
            user_metadata={"email_verified": True},
        ),
        SimpleNamespace(
            id=OTHER_USER, email_confirmed_at="2026-09-01", is_anonymous=False
        ),
        SimpleNamespace(id=USER_ID, email_confirmed_at="2026-09-01", is_anonymous=True),
        SimpleNamespace(
            id=USER_ID,
            email_confirmed_at="2026-09-01",
            is_anonymous=False,
            deleted_at="2026-09-11",
        ),
    ],
)
def test_direct_engine_alpha_requires_current_verified_account(
    alpha, monkeypatch, current
):
    lookup = Mock(return_value=current)
    monkeypatch.setattr("app.auth._current_alpha_account", lookup)
    with pytest.raises(HTTPException) as error:
        verify_jwt(alpha_token(user_metadata={"email_verified": True}))
    assert error.value.status_code == 403
    lookup.assert_called_once()


def test_unadmitted_or_unsigned_identity_never_triggers_account_lookup(
    alpha, monkeypatch
):
    lookup = Mock(
        side_effect=AssertionError("Identity must be admitted before remote lookup")
    )
    monkeypatch.setattr("app.auth._current_alpha_account", lookup)
    for token in (
        alpha_token(sub=OTHER_USER),
        alpha_token(_secret="forged-signature-at-least-thirty-two-characters"),
    ):
        with pytest.raises(HTTPException):
            verify_jwt(token)
    lookup.assert_not_called()


def test_current_identity_check_is_once_per_request_and_not_cached_between_requests(
    alpha, monkeypatch
):
    user = SimpleNamespace(
        id=USER_ID, email_confirmed_at="2026-09-01", is_anonymous=False
    )
    lookup = Mock(side_effect=[user, None])
    monkeypatch.setattr("app.auth._current_alpha_account", lookup)
    ctx = TenantContext(tenant_id=TENANT, user_id=USER_ID, role="owner")
    headers = {"Authorization": "Bearer " + alpha_token(), "X-Tenant-Id": TENANT}
    with (
        patch("app.main.get_supabase_client", return_value=Mock()),
        patch("app.main.resolve_tenant", return_value=ctx),
    ):
        assert alpha.get("/tenant/verify", headers=headers).status_code == 200
        assert lookup.call_count == 1
        assert alpha.get("/tenant/verify", headers=headers).status_code == 403
        assert lookup.call_count == 2


def test_supabase_get_user_uses_supplied_token_without_session_persistence():
    user = SimpleNamespace(id=USER_ID)
    client = Mock()
    client.auth.get_user.return_value = SimpleNamespace(user=user)
    with patch("supabase.create_client", return_value=client) as create:
        assert _current_alpha_account("SYNTHETIC_TEST_SESSION") is user
    client.auth.get_user.assert_called_once_with(jwt="SYNTHETIC_TEST_SESSION")
    options = create.call_args.kwargs["options"]
    assert options.persist_session is False and options.auto_refresh_token is False
    assert options.httpx_client.is_closed is True
    assert options.httpx_client.follow_redirects is False


@pytest.mark.parametrize("status,expected", [(401, 401), (403, 401), (500, 503)])
def test_revoked_session_and_auth_service_errors_are_safe(status, expected, caplog):
    from supabase import AuthApiError

    client = Mock()
    client.auth.get_user.side_effect = AuthApiError(
        "PRIVATE_TOKEN and personal account detail", status, None
    )
    with (
        patch("supabase.create_client", return_value=client),
        pytest.raises(HTTPException) as error,
    ):
        _current_alpha_account("SYNTHETIC_TEST_SESSION")
    assert error.value.status_code == expected
    assert "PRIVATE_TOKEN" not in error.value.detail + caplog.text


def test_auth_transport_exception_is_redacted_and_denied(caplog):
    with (
        patch(
            "supabase.create_client",
            side_effect=RuntimeError("PRIVATE_TOKEN and account detail"),
        ),
        pytest.raises(HTTPException) as error,
    ):
        _current_alpha_account("SYNTHETIC_TEST_SESSION")
    assert error.value.status_code == 503
    assert "PRIVATE_TOKEN" not in error.value.detail + caplog.text


@pytest.mark.parametrize(
    "claims",
    [
        {"role": "authenticated", "is_anonymous": True},
        {"role": "service_role", "is_anonymous": False},
        {"role": "authenticated"},
        {"is_anonymous": False},
    ],
)
def test_alpha_rejects_anonymous_or_missing_identity_claims(alpha, claims):
    with pytest.raises(HTTPException) as error:
        verify_jwt(make_token(**claims))
    assert error.value.status_code == 403


@pytest.mark.parametrize(
    "value", ["", "not-a-uuid", USER_ID + ",", USER_ID + ",bad", None]
)
def test_missing_or_malformed_admission_config_is_closed(alpha, monkeypatch, value):
    monkeypatch.setattr(settings, "inffyn_alpha_user_ids", value)
    response = alpha.get(
        "/v2/monthly/reports", headers={"Authorization": "Bearer " + alpha_token()}
    )
    assert response.status_code == 503
    assert response.headers["cache-control"] == "no-store"
    status = alpha.get("/v2/status").json()
    assert status["release_stage"] == "private_alpha"
    assert status["available"] is False and status["monthly_available"] is False
    assert "user_ids" not in str(status)


@pytest.mark.parametrize("value", ["yes", "1", "unexpected", 1])
def test_ambiguous_alpha_flag_cannot_start_unprotected_runtime(value):
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="synthetic-test-value",
            inffyn_private_alpha=value,
        )


def test_multiple_canonical_uuid_values_can_be_provisioned():
    assert alpha_user_ids(
        SimpleNamespace(inffyn_alpha_user_ids=f" {USER_ID.upper()}, {OTHER_USER} ")
    ) == {USER_ID, OTHER_USER}


@pytest.mark.parametrize(
    "method,path",
    [
        ("POST", "/v2/preview"),
        ("POST", "/v2/previews/claim"),
        ("POST", "/v2/review/calculate"),
        ("POST", "/v2/review/start"),
        ("GET", "/v2/audits"),
        ("POST", "/v2/audits"),
        ("GET", f"/v2/audits/{WORKLOAD}/evidence"),
        ("POST", "/v2/monthly/adopt"),
        ("POST", "/ingest/csv"),
        ("GET", f"/ingest/jobs/{WORKLOAD}"),
        ("POST", "/audit/run"),
        ("GET", "/audit/result"),
        ("POST", "/board-report"),
        ("POST", "/stripe/connect/start"),
        ("GET", "/stripe/connect/callback"),
        ("POST", "/stripe/sync"),
        ("POST", "/stripe/disconnect"),
        ("POST", "/v2/stripe/evidence"),
        ("POST", "/v2/billing/checkout"),
        ("POST", "/v2/billing/portal"),
        ("POST", "/v2/billing-webhook"),
        ("POST", "/v2/monthly/connections/openai"),
        ("DELETE", "/v2/monthly/connections/stripe"),
        ("POST", "/v2/monthly/imports/anthropic"),
        ("POST", f"/v2/monthly/imports/{WORKLOAD}/advance"),
        ("GET", f"/v2/monthly/imports/{WORKLOAD}/evidence"),
        ("GET", "/docs"),
        ("GET", "/openapi.json"),
        ("PATCH", f"/v2/monthly/workloads/{WORKLOAD}"),
        ("POST", "/v2/monthly/reports/"),
        ("GET", "/v2//monthly/reports"),
        ("POST", "/v2/monthly%2Fconnections%2Fopenai"),
        ("GET", "/v2/new-financial-endpoint"),
    ],
)
def test_direct_engine_unapproved_surface_fails_before_repository(alpha, method, path):
    with patch("app.main.get_supabase_client") as database:
        response = alpha.request(method, path, follow_redirects=False)
    assert response.status_code == 403, (method, path, response.text)
    database.assert_not_called()


def test_direct_engine_does_not_accept_frontend_identity_headers(alpha):
    with patch("app.main.get_supabase_client") as database:
        response = alpha.get(
            "/tenant/verify", headers={"X-User-Id": USER_ID, "X-Tenant-Id": TENANT}
        )
    assert response.status_code == 401
    database.assert_not_called()


def test_duplicate_authorization_headers_and_websockets_fail_closed(alpha):
    response = alpha.get(
        "/tenant/verify",
        headers=[
            ("Authorization", "Bearer " + alpha_token()),
            ("Authorization", "Bearer " + alpha_token()),
        ],
    )
    assert response.status_code == 401
    with (
        pytest.raises(WebSocketDisconnect) as error,
        alpha.websocket_connect("/v2/monthly/reports"),
    ):
        pass
    assert error.value.code == 1008


def test_alpha_does_not_bypass_company_membership(alpha):
    headers = {"Authorization": "Bearer " + alpha_token(), "X-Tenant-Id": TENANT}
    with patch("app.main.get_supabase_client", return_value=Mock()):
        with patch(
            "app.main.resolve_tenant",
            side_effect=HTTPException(403, "Membership denied"),
        ) as membership:
            assert alpha.get("/tenant/verify", headers=headers).status_code == 403
            membership.assert_called_once()
        ctx = TenantContext(tenant_id=TENANT, user_id=USER_ID, role="owner")
        with patch("app.main.resolve_tenant", return_value=ctx):
            response = alpha.get("/tenant/verify", headers=headers)
    assert response.status_code == 200
    assert response.json()["user_id"] == USER_ID


def test_alpha_status_disables_billing_despite_flags(alpha, monkeypatch):
    monkeypatch.setattr(settings, "billing_enabled", True)
    monkeypatch.setattr(settings, "billing_price_approved", True)
    response = alpha.get("/v2/status").json()
    assert response["release_stage"] == "private_alpha"
    assert response["billing_available"] is False
    assert response["monthly_price_usd"] is None
    assert alpha.get("/health").json()["release_stage"] == "private_alpha"
    demo = alpha.get("/demo/company")
    assert demo.status_code == 200
    assert demo.headers["x-inffyn-data"] == "synthetic"


def test_maintenance_stays_separately_authenticated(alpha):
    with patch("app.main.get_supabase_client") as database:
        assert alpha.post("/v2/maintenance").status_code == 401
        assert (
            alpha.post(
                "/v2/maintenance", headers={"Authorization": "Bearer " + alpha_token()}
            ).status_code
            == 401
        )
    database.assert_not_called()


@pytest.mark.parametrize("flag", ["true", "nonsense", "1"])
def test_vercel_never_selects_stateless_preview_when_alpha_requested(monkeypatch, flag):
    persistent, preview = object(), object()
    monkeypatch.setenv("INFFYN_PRIVATE_ALPHA", flag)
    monkeypatch.setenv("INFFYN_PREVIEW_MODE", "true")
    monkeypatch.setenv("INFFYN_PREVIEW_STORAGE", "browser")
    monkeypatch.setitem(sys.modules, "app.main", SimpleNamespace(app=persistent))
    monkeypatch.setitem(sys.modules, "app.v2.review_host", SimpleNamespace(app=preview))
    assert runpy.run_module("app.vercel_entry")["app"] is persistent


def test_pinned_alpha_deployment_remains_closed_when_enable_flag_is_missing(
    alpha, monkeypatch
):
    monkeypatch.setattr(settings, "inffyn_release_stage", "private_alpha")
    monkeypatch.setattr(settings, "inffyn_private_alpha", False)
    status = alpha.get("/v2/status").json()
    assert status["release_stage"] == "private_alpha"
    assert status["available"] is False and status["billing_available"] is False
    assert alpha.get("/v2/monthly/reports").status_code == 503
    assert alpha.post("/v2/preview").status_code == 403


def test_marker_alone_cannot_select_preview_runtime(monkeypatch):
    persistent = object()
    monkeypatch.delenv("INFFYN_PRIVATE_ALPHA", raising=False)
    monkeypatch.setenv("INFFYN_RELEASE_STAGE", "private_alpha")
    monkeypatch.setenv("INFFYN_PREVIEW_MODE", "true")
    monkeypatch.setenv("INFFYN_PREVIEW_STORAGE", "browser")
    monkeypatch.setitem(sys.modules, "app.main", SimpleNamespace(app=persistent))
    assert runpy.run_module("app.vercel_entry")["app"] is persistent


@pytest.fixture
def alpha_api(tmp_path):
    repo = LocalRepository(tmp_path / "alpha.sqlite")
    repo.grant = lambda tenant: {"revoked_at": None}
    config = SimpleNamespace(
        audit_v2_enabled=True,
        audit_retention_approved=True,
        billing_enabled=True,
        billing_price_approved=True,
        stripe_billing_price_id="fixture-price",
        monthly_enabled=True,
        inffyn_private_alpha=True,
        inffyn_alpha_user_ids=USER,
        inffyn_preview_mode=True,
        openai_import_enabled=True,
        anthropic_import_enabled=True,
        stripe_import_enabled=True,
    )

    def resolve(db, user, tenant):
        if tenant != TENANT:
            raise HTTPException(403, "Fixture company membership denied")
        return SimpleNamespace(tenant_id=tenant, user_id=user, role="owner")

    instance = FastAPI()
    instance.include_router(
        build_router(config, lambda: None, lambda: USER, resolve, lambda: repo)
    )
    return TestClient(instance), repo, config


def test_alpha_uses_real_grant_not_preview_entitlement(alpha_api):
    client, repo, _ = alpha_api
    headers = {"X-Tenant-Id": TENANT}
    assert (
        client.get("/v2/billing", headers=headers).json()["access_source"]
        == "complimentary"
    )
    repo.grant = lambda tenant: None
    status = client.get("/v2/billing", headers=headers).json()
    assert status["entitled"] is False and status["access_source"] == "free"
    assert (
        client.post(
            f"/v2/monthly/workloads/{WORKLOAD}",
            headers=headers,
            json={k: v for k, v in definition().items() if k != "id"},
        ).status_code
        == 402
    )


def test_alpha_connector_metadata_never_reads_provider_storage(alpha_api):
    client, repo, _ = alpha_api
    repo.monthly.list = Mock(
        side_effect=AssertionError("Provider evidence must not be read")
    )
    headers = {"X-Tenant-Id": TENANT}
    metadata = client.get("/v2/monthly/connections", headers=headers).json()
    assert len(metadata["connections"]) == 3
    assert all(
        not row["available"] and row["status"] == "unavailable"
        for row in metadata["connections"]
    )
    assert client.get("/v2/monthly/imports", headers=headers).json()["imports"] == []
    assert (
        client.post(
            "/v2/monthly/connections/openai", headers=headers, json={}
        ).status_code
        == 403
    )
    repo.monthly.list.assert_not_called()


def test_alpha_report_context_is_server_owned_and_historical_versions_unchanged(
    alpha_api,
):
    client, repo, config = alpha_api
    headers = {"X-Tenant-Id": TENANT}
    data = body().model_dump(mode="json")
    config.inffyn_private_alpha = False
    workload = {k: v for k, v in definition().items() if k != "id"}
    assert (
        client.post(
            f"/v2/monthly/workloads/{WORKLOAD}", headers=headers, json=workload
        ).status_code
        == 200
    )
    historical = client.post("/v2/monthly/reports", headers=headers, json=data).json()
    assert "release_context" not in historical["result"]
    config.inffyn_private_alpha = True
    alpha = client.post("/v2/monthly/reports", headers=headers, json=data).json()
    assert alpha["id"] != historical["id"]
    assert alpha["fingerprint"] != historical["fingerprint"]
    assert alpha["result"]["release_context"] == {"stage": "private_alpha"}
    original_result = copy.deepcopy(historical["result"])
    compared = copy.deepcopy(alpha["result"])
    compared.pop("release_context")
    compared["fingerprint"] = original_result["fingerprint"]
    assert compared == original_result  # No financial/confidence/provenance changes.
    assert (
        client.get(f"/v2/monthly/reports/{historical['id']}", headers=headers).json()
        == historical
    )
    assert (
        client.post("/v2/monthly/reports", headers=headers, json=data).json()["id"]
        == alpha["id"]
    )
    hostile = {**data, "release_context": {"stage": "standard"}}
    assert (
        client.post("/v2/monthly/reports", headers=headers, json=hostile).status_code
        == 422
    )
    data["workloads"][0]["import_ids"] = [WORKLOAD]
    assert (
        client.post("/v2/monthly/reports", headers=headers, json=data).status_code
        == 403
    )
    assert len(repo.monthly.list("reports", TENANT)) == 2


def test_alpha_user_is_checked_before_repository_on_injected_router(alpha_api):
    client, repo, config = alpha_api
    config.inffyn_alpha_user_ids = OTHER_USER
    repo.is_admin = Mock(side_effect=AssertionError("Must deny before admin lookup"))
    assert client.get("/v2/access/admin").status_code == 403
    assert (
        client.get("/v2/monthly/reports", headers={"X-Tenant-Id": TENANT}).status_code
        == 403
    )
    repo.is_admin.assert_not_called()


def test_alpha_csv_draft_resumes_and_conflicts_preserve_saved_state(alpha_api):
    client, _, _ = alpha_api
    headers = {"X-Tenant-Id": TENANT}
    workload = {k: v for k, v in definition().items() if k != "id"}
    assert (
        client.post(
            f"/v2/monthly/workloads/{WORKLOAD}", headers=headers, json=workload
        ).status_code
        == 200
    )
    content = body().model_dump(mode="json", exclude={"schema_version"})
    draft_path = "/v2/monthly/drafts/2026-08"
    assert client.get(draft_path, headers=headers).json() == {"draft": None}
    request = {"expected_revision": 0, "content": content}
    saved = client.put(draft_path, headers=headers, json=request)
    assert saved.status_code == 200, saved.text
    client.close()
    # Fresh client object exercises persistent repository state rather than a
    # remembered client response; live sign-in remains a hosted acceptance gate.
    resumed = TestClient(client.app)
    assert resumed.get(draft_path, headers=headers).json() == saved.json()
    assert resumed.put(draft_path, headers=headers, json=request).status_code == 409
    assert (
        resumed.get(draft_path, headers={"X-Tenant-Id": OTHER_USER}).status_code == 403
    )
    assert resumed.get(draft_path, headers=headers).json() == saved.json()


def test_default_engine_math_and_input_contract_do_not_admit_release_context():
    source = body()
    original = calculate_month(source, {WORKLOAD: definition()})
    assert "release_context" not in original
    assert "synthetic" not in original
    with pytest.raises(ValidationError):
        MonthlyInput.model_validate(
            source.model_dump(mode="json")
            | {"release_context": {"stage": "private_alpha"}}
        )
    with pytest.raises(ValueError):
        calculate_month(
            source, {WORKLOAD: definition()}, release_context={"stage": "production"}
        )


def test_new_routes_methods_and_lookalike_paths_are_closed_by_default():
    assert route_access("GET", "/v2/monthly/reports") == "authenticated"
    assert route_access("POST", "/v2/monthly/reports") == "authenticated"
    assert route_access("POST", "/v2/monthly/reports/override") is None
    assert route_access("PUT", "/v2/monthly/reports") is None
    assert route_access("GET", "/v2/monthly/reports;anything") is None
