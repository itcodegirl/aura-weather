# Claude Code Handoff — Aura "Glacier" Redesign (drift-proof build)

> **▶ START HERE — before any analysis or edits.**
> 1. Read **`CLAUDE.md`** at the repo root and follow it. It is the source of truth for repo conventions (git identity, commit style, branch workflow, tokens, file layout). **If anything here conflicts with `CLAUDE.md`, `CLAUDE.md` wins.**
> 2. Read **`docs/redesign/glacier/GLACIER_BUILD_SPEC.md`** in full.
> 3. Open **`docs/redesign/glacier/mockups/index.html`** and look at every CANONICAL mockup. **These are the contract.** When the spec prose and a mockup disagree, the mockup wins.
> Confirm you've done all three before starting.

## Context (why this handoff exists)
A prior build (closed PR #81, and the not-yet-merged PR #82) did palette + cards + a Details pill, skipped the actual mockup (animated hero, flowing-curve hourly, data chips, drawer mini-hourly, bento), and declared itself done. Jenna correctly rejected it. The spec + recovered mockups exist specifically so that can't recur. **Build to the mockups. Do not self-certify done.**

## Repo / identity guardrail
- Repo: `itcodegirl/aura-weather`. Confirm the worktree is **outside OneDrive** before touching files.
- Before ANY git operation: verify `git config user.name` resolves to **`itcodegirl`** and check `gh auth status`.
- Conventional commits, authored as **`itcodegirl`**. **No** Claude attribution, **no** `Co-authored-by` trailers, anywhere (commits, PR body, file headers).

## Branch
- Branch off latest `origin/main`: **`claude/glacier-redesign-spec`**.
- (The good foundation from the prior real attempt — deep Glacier theme, card system, Details pill — may be cherry-picked if clean: `f0892cd`, `5f99104`. Rebuild everything else from the spec + mockups; do not trust the prior hero/hourly/bento work.)

## Confirm before editing
Before writing any files, **print: (a) the exact file list you intend to touch per phase, (b) the two resolved decisions you'll honor — bento = build, accent = `#6fb7f2` (change the app's `#8bd3ff`), (c) confirmation the preview MCP will NOT be used for visual verification (it hangs on this app's particle loop — use `npm run screenshots`).** Then wait for Jenna's go. Do not scaffold until she confirms.

## Scope constraint (hard)
- **Surgical restyle + the named new pieces only.** Keep all engineering, data layer, the missing-data trust contract, and a11y. Restyle the surface; add only what the spec's §3 components require.
- **Build exactly the CANONICAL components in `GLACIER_BUILD_SPEC.md` §3.** Nothing outside them.
- **Two decisions are resolved (spec §5) — execute them, don't re-litigate:** (1) **Bento = build** — the Atmosphere bento (§3.7) is in scope; build it to its mockup, just don't duplicate a metric's primary home. (2) **Accent = `#6fb7f2`** — change the app's `#8bd3ff` → `#6fb7f2` everywhere (grep for it). Echo both at the top of the PR.
- If any component lacks a CANONICAL mockup, **stop and ask** — do not invent.

## Commits (one per component/phase)
Logical chunks, e.g.: tokens/theme (incl. `#8bd3ff`→`#6fb7f2`) → reactive hero → flowing-curve hourly → near-term outlook → storm-watch restyle → atmosphere bento → 7-day (pill + drawer + mini-hourly) → trust footer. Commit locally per phase.

## Verification (the gate — spec §6/§7)
- **Per component:** build → `npm run screenshots` (NOT the preview MCP) → read the PNGs → open the matching mockup → confirm **every** acceptance checkbox in spec §3 for that component.
- Lint clean + full existing test suite green. Re-record visual-regression baselines on CI only (`gh workflow run quality-gates.yml`) **after** Jenna approves the look — never hand-roll baselines.
- **Fill spec §7's acceptance checklist with evidence (which PNG, which run) — mandatory.** An unfilled/hand-waved checklist means not done.

## HARD STOP
- Do **not** push, do **not** open a PR, do **not** merge.
- Stop after local commits + the filled §7 checklist + the screenshot PNGs, and show Jenna the result.
- **Jenna** pushes, opens the PR, reviews the **Netlify deploy preview**, and is the only one who marks it done / merges. Auto-merge stays off.

---
*Build to the mockups. If you can't point to the mockup, don't build it. If you skipped one, say so — don't decide it for her.*
