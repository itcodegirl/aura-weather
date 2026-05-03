# Screenshots

This folder is populated by the Playwright trust-contract spec at
`e2e/trust-contract-screenshot.spec.js`. The CI workflow uploads
the contents as an artifact named `trust-contract-screenshots`.

To regenerate locally:

```bash
npm run test:e2e -- e2e/trust-contract-screenshot.spec.js
```

The PNGs are intentionally not committed to git (the
`.gitkeep` keeps the folder tracked). See the project root
`README.md` for the rendered version.
