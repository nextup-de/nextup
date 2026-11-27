# Rules for coding agents (Codex, Claude, any other)

Read `CLAUDE.md` in this folder and follow it: its rules apply to every agent, not only Claude. The two most
often missed:

- **Design:** `docs/DESIGN_RULES.md` and `docs/DESIGN_SCALE.md`. Only tokens from
  `apps/app/src/styles/tokens.css`: sizes, line heights, spacing (`var(--nh-sp-N)`), colours; font Inter.
- **Building from a Paper frame:** run `npm run paper:check -w @nextup/app -- <frame id>` first, build with the
  values it names, never write to Paper, and fill the PR's "Paper" section (check summary + screenshot next to
  the frame, or `No Paper frame:` and why). CI fails a CSS/TSX PR with that section empty.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
