# Release Checklist

Run these checks before tagging a public release:

```bash
npm run check
npm test
npm run sanitize:check
npm audit --audit-level=low
npm run doctor
```

Confirm these paths are ignored and not staged:

- `.env`
- `credentials/*.json`
- `sessions/**`
- `database/*.db`
- `database/*.db-*`
- `logs/**`
- `output/master_index.json`
- `output/courses/**`

Recommended release command:

```bash
git tag -a v0.1.0 -m "v0.1.0"
git push origin main --follow-tags
gh release create v0.1.0 --title "v0.1.0" --notes-file CHANGELOG.md
```
