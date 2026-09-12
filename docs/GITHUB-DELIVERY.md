# GitHub-first delivery

Repository: https://github.com/RHirsh27/InfFyn (currently public).

Every completed build increment should have a pushed feature branch, a reviewable commit and GitHub Actions results. Local tests are optional development feedback; the owner can inspect the shared verification run without running a local terminal.

## CI

`.github/workflows/verify.yml` runs on push, pull requests and manual dispatch. It installs pinned dependencies, tests the engine and database controls, tests alpha/recovery boundaries, builds the app and checks TypeScript. It uses synthetic configuration and does not require or upload Supabase, Stripe or provider credentials. The hosted acceptance runner reports pending unless explicitly executed separately.

The source guard scans the Git index without reading local `.env` files and prints only filenames/categories if it detects a potential secret. Raw audit outputs, account exports, encrypted backups and local databases are excluded from source publication. GitHub is not the database backup destination.

## Connect the existing Vercel projects

Select the pushed build branch for initial review; main still represents the last merged version until the pull request is merged.

| Setting | Application | Engine |
|---|---|---|
| Existing project | `inffyn-preview` | `inffyn-preview-engine` |
| Git repository | `RHirsh27/InfFyn` | `RHirsh27/InfFyn` |
| Root Directory | `app` | `engine` |
| Framework | Next.js | FastAPI |
| Config | `app/vercel.json` | `engine/vercel.json` |
| Runtime | Node 22 | Python 3.12 |
| Install | `cd .. && npm ci` | `pip install -r requirements.txt -c constraints-v1.txt` |
| Build | `npm run build` | Vercel FastAPI detection |

For the application enable access to source files outside the Root Directory: the npm lockfile and shared workspace package live at the repository root. Enter environment values in Vercel's secure configuration, using the committed `.env.example` files for names only. Do not copy local files into GitHub.

Deploy the persistent engine before configuring the app's `ENGINE_URL`. Use restricted Preview deployments and the existing alpha admission settings. Preserve current public aliases. GitHub CI and a successful Vercel build do not activate the private alpha: reviewed database migrations, manual recovery, identity configuration and authenticated acceptance remain required.

## Ongoing handoff

1. Work on a feature branch and preserve unrelated edits.
2. Commit source, tests and updated implementation notes; run `python scripts/check-source-safety.py` after staging.
3. Push the branch and inspect **Actions → Verify InfFyn**.
4. Open or update the pull request with behavior changes, verification and remaining hosted dependencies.
5. Share the branch/PR and commit SHA. After authorized integration, Vercel can build the selected Git branch.

No automatic database migration, billing activation, live provider import or production deployment is part of CI.
