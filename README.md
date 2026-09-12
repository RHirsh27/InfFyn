# InfFyn — AI economics, with evidence

**Shared delivery:** [GitHub repository](https://github.com/RHirsh27/InfFyn) · [CI runs](https://github.com/RHirsh27/InfFyn/actions) · [GitHub/Vercel setup](docs/GITHUB-DELIVERY.md) · [latest reviewed-import implementation](docs/REVIEWED-IMPORT-IMPLEMENTATION.md).

Changes are delivered through pushed feature branches and pull requests. GitHub Actions builds and tests each push; local-only completion is not the handoff standard. Real-data activation remains a separate verified release gate.

Next.js application, FastAPI economic engine and Supabase persistence. The revised v1 supports customer-product and internal-workflow audits, reviewed revenue files, saved evidence and subscription entitlements.

Start with the [revised PRD](docs/V1-REVISED-PRD.md), [founder packet](docs/FOUNDER-PACKET-V1.md) and [release / local validation runbook](docs/V1-RELEASE-RUNBOOK.md). The local validation app uses synthetic data and durable SQLite, with provider actions disabled. Hosted acceptance remains separate.

## Structure

```
inffyn/
├── app/                  # Next.js (App Router, TypeScript)
├── engine/               # FastAPI (Python)
├── packages/types/       # Shared type stubs
├── supabase/             # Migrations + local dev config
├── render.yaml           # Render blueprint for engine
└── package.json          # npm workspaces root
```

## Prerequisites

- Node.js 20.9+ (Next 16)
- Python 3.11+
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Local `.env` files (copy from `.env.example`, fill in real values)

## Local Development

### 1. Install JS dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
cp app/.env.example app/.env
cp engine/.env.example engine/.env
# Fill in Supabase URL, anon key, service-role key, and optional Sentry DSN
```

### 3. Run the Next.js app

```bash
npm run dev:app
# → http://localhost:3000
```

### 4. Run the FastAPI engine

```bash
cd engine
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt -c constraints-v1.txt
uvicorn app.main:app --reload --port 8000
# → http://localhost:8000
```

### Health checks

```bash
curl http://localhost:3000/api/health
# {"status":"ok"}

curl http://localhost:8000/health
# {"status":"ok"}
```

## Supabase Migrations

### Link to remote project (one-time)

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

### Apply migrations

```bash
supabase db push
```

### Rollback (local)

Option A — reset local database (destroys local data):

```bash
supabase db reset
```

Option B — run the down migration manually against local or remote:

```bash
psql <connection-string> -f supabase/migrations/0001_scaffold_healthcheck.down.sql
```

The scaffold migration creates a throwaway `scaffold_healthcheck` table. It will be replaced in E2.

## Deploy

### Vercel (Next.js app)

1. Import the GitHub repo into the InfFyn Vercel team.
2. Set **Root Directory** = `app`.
3. Set **Framework Preset** = `Next.js` (not "Other").
4. Leave **Output Directory** blank — do not set it to `public`. `app/vercel.json` sets `"framework": "nextjs"`.
5. **Install Command** (auto from `app/vercel.json`): `cd .. && npm install`
6. Add environment variables from `app/.env.example`.
7. Deploy — `/api/health` should return `{"status":"ok"}`.

### Render (FastAPI engine)

1. Connect the repo and use `render.yaml` (Blueprint), or create a web service manually.
2. Set **Root Directory** = `engine`.
3. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables from `engine/.env.example`.
5. Health check path: `/health`.

### Supabase (remote)

```bash
supabase link --project-ref <ref>
supabase db push
```

## Sentry

Both apps read `SENTRY_DSN`. If absent, Sentry init is skipped — apps boot normally.

## E1 — Tenancy & Auth

### Apply migration

```bash
supabase link --project-ref <ref>
supabase db push   # applies 0002_tenancy
```

### Run isolation test (required gate)

```bash
# Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run test:isolation
```

### Run engine tenant guard tests

```bash
npm run test:engine
```

### Auth flow

1. Enable Email + magic link in Supabase dashboard.
2. Set Site URL + redirect URLs (Vercel domain + `http://localhost:3000/auth/callback`).
3. Visit `/login` → magic link → `/auth/callback` → `/app`.
4. First visit with no membership → create tenant form → `create_tenant()` RPC.
5. Active tenant stored in `active_tenant_id` cookie; switcher if multiple memberships.

## What's NOT in E0

- Auth, tenancy, RLS → E1
- Real data tables → E2
- Ingestion, Stripe, UI → E3+
