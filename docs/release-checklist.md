# Release Checklist

Run these checks before tagging a public release:

```bash
npm run check
npm test
npm run sanitize:check
npm run compliance:check
npm audit --audit-level=low
npm run doctor
npm run build:standalone
node src/crawler/run.js --plan-only
node src/crawler/run.js --no-download
```

Confirm these paths are ignored and not staged:

- `.env`
- `credentials/*.json`
- `sessions/**`
- `database/*.db`
- `database/*.db-*`
- `logs/**`
- `output/master_index.json`
- `output/download_plan.json`
- `output/download_selection.json`
- `output/courses/**`

Recommended release command:

```bash
git tag -a v0.1.0 -m "v0.1.0"
git push origin main --follow-tags
```

Pushing the tag starts `.github/workflows/release.yml`, which builds the Windows, macOS, and Linux standalone executables and creates the GitHub Release.
