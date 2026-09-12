# InfFyn on Render: native Python private alpha

The September 12 hosting decision moves the persistent engine to Render without requiring Docker on the operator's computer. The existing InfFyn Supabase project remains the database and identity provider. The existing Vercel frontend and public review aliases remain in place. This change does not migrate customer data to Render Postgres or relax recovery requirements.

## Deployment contract

`render.yaml` defines one native Python web service:

| Setting | Value |
| --- | --- |
| Name | `inffyn-engine-alpha` |
| Source | `RHirsh27/InfFyn`, branch `codex/private-alpha-reviewed-imports` |
| Runtime / root | Python 3.12.12 / `engine` |
| Build | `pip install -r requirements.txt -c constraints-v1.txt` |
| Start | `uvicorn app.render_entry:app --host 0.0.0.0 --port $PORT --no-access-log` |
| Health | `/health` |
| Region / initial compute | Ohio / Free |
| Automatic deployment | After linked GitHub checks pass, when the Git integration supports it |

The Free plan is for restricted deployment verification. Render documents idle spin-down and other limits; it is not the production operating plan. Do not create paid resources or change workspace billing as part of this preparation. No Render Postgres, persistent disk, Docker image, build-time migration or startup migration is defined.

The dedicated entry point refuses startup if alpha markers are missing, the wrong Supabase project is configured, or preview, provider or billing enablement is requested. It loads exactly the existing Supabase URL and service credential from `/etc/secrets/inffyn-engine.env`. The file never enters source control, command-line argument values or application responses. Upload it with Render's secret-file mechanism through an authorized CLI session; do not print or paste its contents into chat. Raw HTTP access logging is disabled to avoid recording sensitive query strings.

An empty UUID allowlist deliberately leaves company operations unavailable while health and status remain inspectable. The blueprint also leaves retention approval false. These are activation gates, not a synthetic replacement engine. Before real-data use, configure verified identities, finish recovery and migrations, verify retention and company isolation, and then enable the reviewed settings in both services. Existing JWT and membership checks remain mandatory.

## Operator sequence

1. Authenticate the official `render-oss/cli`, select the existing owner workspace, and inspect existing services before creating one. The unrelated npm package `render-cli` renders templates and is not the Render hosting CLI.
2. Validate `render.yaml` with `render blueprints validate render.yaml --output json`. Use `render services create --help` for the installed CLI's supported flags. The prepared version is 2.28.0, verified against the official release checksum.
3. Create only the named alpha service from the pushed feature branch, carrying the exact public configuration above and the secret file. Do not log an unfiltered service response because service metadata can contain deploy hooks and credentials. Record only service ID, URL, deployment status and Git SHA in the private operator receipt.
4. Wait for the Git-based deployment and verify `/health` reports `private_alpha`. Confirm `/v2/status` reports company/audit availability false while the allowlist is unset; probe provider, billing, legacy intake and anonymous company routes for denial. A health response alone does not prove shared persistence.
5. After recovery and database acceptance, configure the Vercel application's server-only `ENGINE_URL` to the verified Render service URL. Preserve the public aliases and existing Vercel engine until the new engine passes acceptance. Use the same server-side proxy credential when enabling the application path.
6. Run the authenticated company workflow and isolated-tenant checks before Stephen's real-data session. Update [PRIVATE-ALPHA-ACTIVATION.md](PRIVATE-ALPHA-ACTIVATION.md) with actual results.

## Recovery without local Docker

The encrypted native database capture already exists outside the repository. Drive retrieval, Storage bytes, independent key recovery and a faithful restoration remain separate requirements. No local Docker command is required by this Render deployment.

The source has `supabase_vault` 0.3.1. Render's managed Postgres supported-extension list does not list this extension, so a new Render Postgres database is not an established substitute for the full restore rehearsal. Do not omit Vault, ownership, grants or identity records merely to make restoration succeed. A compatible isolated native PostgreSQL environment still needs verification. No backup or recovery identity has been uploaded to Render by this deployment preparation.

## Sources and evidence

- [Native FastAPI deployment](https://render.com/docs/deploy-fastapi)
- [Blueprint reference](https://render.com/docs/blueprint-spec)
- [Render secret files](https://render.com/docs/configure-environment-variables#secret-files)
- [Free service limits](https://render.com/docs/free)
- [Supported PostgreSQL extensions](https://render.com/docs/postgresql-extensions)

Local verification: `engine/tests/test_render_config.py` and `engine/tests/test_private_alpha.py` passed 100 checks with synthetic configuration, including literal secret-file parsing and absent-file failure. Hosted deployment, authorized application sessions and recovery verification must be reported separately.
