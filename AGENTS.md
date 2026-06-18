# Agent Instructions for Aura Weather

## Project Summary

Aura Weather is a React/Vite JavaScript weather app. It is JavaScript/JSX, not TypeScript.

The project prioritizes weather data trust, accessibility, resilient UI states, and portfolio-quality frontend architecture. Treat the data-trust behavior as a product contract, not a presentation detail.

## Architecture Boundaries

Preserve the dependency direction:

```text
components -> hooks -> api/services -> utils/domain
```

- Components must not fetch directly.
- API and service modules must not import React.
- Hooks may orchestrate state, effects, persistence, and request lifecycles, but should not own visual design decisions.
- Utilities and domain code should stay pure where possible.
- Match existing JavaScript/JSX patterns before introducing new abstractions.

## Data Trust Contract

Aura's core promise is that missing provider data stays honest.

- Never use `Number(value)` for provider, coordinate, timestamp, weather, or display data.
- Use `toFiniteNumber` for numeric provider data and other nullable external inputs.
- Missing provider data must render as unavailable.
- Missing values must never become `0`, `0%`, `0 hPa`, `0°F`, dry, calm, stable, or coordinates `(0,0)`.
- Cached, stale, offline, and unavailable states must remain visibly labeled.
- Unit toggling must not refetch forecast or archive data unless a task explicitly requires changing that contract.
- Preserve the `?mock=missing` trust-contract demo path and its provider-isolation behavior.

## Accessibility Expectations

- Preserve visible focus states.
- Preserve `aria-busy`, `role="status"`, `role="alert"`, and missing-value announcements.
- Do not remove screen-reader-only context without replacing it with equivalent accessible context.
- Keyboard support must be preserved for search, saved locations, expandable panels, and forecast details.
- Avoid broad live-region changes. Keep announcements scoped and intentional.

## UI/UX Guardrails

- Avoid broad visual rewrites.
- Do not touch large CSS/layout files unless the task explicitly requires it.
- Keep Aura calm, atmospheric, readable, premium, and trustworthy.
- Prefer small, targeted polish over sweeping redesigns.
- Preserve mobile behavior, reduced-motion behavior, and reduced-data behavior when changing UI.

## UI / Visual Design Ownership

- Do not make subjective UI or visual design decisions.
- Audit only unless exact implementation instructions are provided.
- If a visual issue requires design judgment, report it and stop.
- Coding agents may audit UI, document UI issues, and identify possible causes, but they must not perform broad visual redesigns.
- Do not make subjective visual changes such as "make it cleaner," "make it premium," "improve spacing," "modernize the UI," or "polish the dashboard" unless the task provides exact implementation instructions.
- Do not restructure the dashboard layout, card hierarchy, responsive system, visual rhythm, color system, typography scale, or atmospheric styling without explicit human-approved design direction.
- Do not touch large UI/CSS files for subjective polish unless explicitly instructed.

High-risk UI files:

- `src/App.css`
- `src/components/layout/AppHeader.css`
- `src/components/HourlyCard.jsx`
- `src/components/ForecastCard.jsx`
- `src/components/radar/RadarPanel.jsx`
- Any global layout, token, theme, or responsive CSS file.

Allowed UI-related work:

- Accessibility fixes with a narrow scope.
- Broken layout fixes with a clearly described bug.
- Tests for UI behavior.
- Documentation of UI findings.
- Small implementation changes based on exact human-provided specs.

Disallowed UI-related work:

- Full visual redesigns.
- Dashboard layout redesigns.
- Unrequested CSS refactors.
- Subjective spacing or typography changes.
- Color/theme changes.
- Component restyling based only on agent judgment.
- Updating visual baselines without human screenshot review.

Required behavior:

- If a UI task is vague or subjective, stop and return an audit/report only.
- If screenshots are involved, describe findings and wait for human design direction before editing.
- Prefer recommendations over edits for visual design work.
- Preserve the existing Aura visual direction unless exact changes are requested.

## Risky Files

Use extra caution before editing these files:

- `src/api/openMeteo.js`
- `src/hooks/useWeatherData.js`
- `src/App.css`
- `src/components/layout/AppHeader.css`
- `src/components/HourlyCard.jsx`
- `src/components/ForecastCard.jsx`
- `src/components/radar/RadarPanel.jsx`

These files touch provider normalization, request lifecycle, offline/cache trust states, large layout surfaces, or places where local numeric parsing can accidentally violate the data-trust contract.

## Documentation Rules

- Treat old handoff docs as historical unless they match current code.
- Check current source before updating `README.md` or docs.
- Do not repeat stale RainViewer/radar assumptions without verifying code.
- Do not describe Aura as TypeScript or invent scripts/dependencies that are not in `package.json`.

## Required Workflow

Before changes:

1. Run `git status --short --branch`.
2. Inspect relevant tests before editing.
3. Identify the narrowest validation command for the change.

After changes:

1. Run `npm run lint`.
2. Run `npm test`.
3. Run `npm run build`.
4. For UI or data-trust changes, run relevant Playwright or Lighthouse checks when appropriate.

Use `npm run test:e2e -- --workers=1` for broad browser-flow validation. Use visual or Lighthouse checks only when the task affects layout, screenshots, PWA/offline behavior, accessibility budgets, or performance budgets.

## PR Checklist

- Scope stayed narrow.
- Data trust contract preserved.
- No fake zero values introduced.
- Cached, stale, offline, and unavailable labels preserved.
- Unit toggle behavior preserved.
- Accessibility states preserved.
- Tests added or updated when behavior changed.
- Validation commands documented.

# Branching

**Never edit or commit directly on `main`.** Before touching files, run `git branch --show-current` and confirm the branch:

- **Branch named in the task** → use it; create it off `main` if it doesn't exist yet.
- **No branch named, currently on `main`** → stop and ask which branch to cut. Don't guess a name; don't edit on `main`.
- **Already on a feature branch** → continue it only if the task is part of that branch's work. If the task is unrelated, ask before cutting a new branch off `main`.

One branch per feature/fix. Conventional names: `feat/…`, `fix/…`, `chore/…`.

## Git workflow & identity

All commits, pushes, and PRs authored as **`itcodegirl`**.

- Before the first commit: confirm `git config user.name` / `user.email` are itcodegirl.
- Before any push or PR: confirm `gh auth status` shows the itcodegirl account.
- **No `Co-authored-by: Codex` trailers. Do not sign as Codex** anywhere — commit, push, or PR.

**Flow:** commit to the feature branch with conventional messages → push the branch → open a PR against `main` as itcodegirl, using the PR body template below. The PR body summarizes the change and the verification run.

**Hard stop at the open PR. Never merge.** Jenna reviews and merges. Do not enable auto-merge, do not merge after CI passes, do not merge on approval — stop at the open PR every time.

### PR body template

Every PR Claude Code opens uses this shape:

```
**Summary**
<2–4 lines: what changed and why.>

**Scope**
<Files / areas touched; confirm nothing else was.>

**Verification**#
<Checks run + results: build, lint, typecheck, relevant tests/audits.>

**Out of scope**
<What was deliberately not done; any follow-ups noted.>
```
