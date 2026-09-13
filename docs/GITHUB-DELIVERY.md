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

## Preview configured September 12, 2026

Later September 12 decision: use Render's native Python runtime for the persistent alpha engine, retaining the Vercel frontend and existing public aliases. See [RENDER-PRIVATE-ALPHA.md](RENDER-PRIVATE-ALPHA.md) and `render.yaml`. The Vercel engine described below remains the stateless review fallback until Render activation is verified; do not treat the configuration below as a persistent-alpha deployment.

Both existing Vercel projects are connected to `RHirsh27/InfFyn`. Their production branch remains `main`; this setup does not merge or promote the feature branch.

- Review branch: `codex/private-alpha-reviewed-imports`.
- Application: https://inffyn-preview-git-codex-p-8fa386-ryanmhirsh-gmailcoms-projects.vercel.app/demo/monthly
- Reviewed CSV walkthrough: https://inffyn-preview-git-codex-p-8fa386-ryanmhirsh-gmailcoms-projects.vercel.app/demo/reviewed-import
- Engine branch address: https://inffyn-preview-engine-git-38ce89-ryanmhirsh-gmailcoms-projects.vercel.app

Vercel Authentication remains enabled. Open previews while signed into the owning Vercel account; team access is separate from InfFyn company membership. No deployment-protection secret belongs in a shared URL.

Preview configuration enables the stateless review engine and browser-local audit history. The demonstrations are fixed synthetic evidence. Protected company workflows remain unavailable until database recovery and private-alpha activation are completed. Preview build success does not establish shared persistence or provider acceptance.

The preview environments have a separate server-side request secret. The app also has a sensitive engine-protection credential and a branch-specific `ENGINE_URL` targeting the engine branch address. These values are managed only in Vercel. Production environment values and public aliases were preserved.

For another branch, configure its engine address before building the app. Deployments are built remotely from GitHub source; local source uploads and local production builds are not needed for this flow. Inspect both Vercel deployment results and GitHub Actions after a push.
