# InfFyn delivery rules

GitHub is the shared source of truth: https://github.com/RHirsh27/InfFyn.

- For an authorized build task, commit completed source changes and push the current feature branch before handoff. Include a GitHub link and commit SHA in the final report. Do not leave completed work only on the local machine.
- Run or inspect GitHub Actions verification. Report queued, failed and passed states honestly. CI builds and tests use synthetic data; they do not prove hosted authentication, provider access or database recovery.
- Use a pull request for integration into main. Do not force-push shared branches, merge main, change repository visibility, mutate customer databases or deploy production unless the user authorizes that action.
- Preserve existing uncommitted work. Stage explicit source paths. Never commit environment values, credentials, private keys, backups, raw account exports or contents of `outputs/`.
- Keep implementation notes, decisions and reproducible tests in the repository. Keep private financial/security evidence in approved private storage.
- Follow `docs/GITHUB-DELIVERY.md` for CI and Vercel project settings, and the existing private-alpha activation checklist for real-data release.
- Application-specific framework instructions are in `app/AGENTS.md`.
