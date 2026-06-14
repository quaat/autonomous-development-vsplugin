# Changelog

All notable changes to the SemanticMatter Autonomous Development extension are
documented here. This project adheres to [Semantic Versioning](https://semver.org/).

## 0.3.0

Compatibility target unchanged from 0.2.0: `quaat/autonomous-development`
**v0.3.0**, run-state `schema_version` 2 (versions 1 and 2 supported).

### Added

- **Start Run command.** Start a new autonomous-development run without leaving
  VS Code: the `+` button in the _Active Runs_ view title (and the **Autonomous
  Development: Start Run** palette command) prompts for a feature description,
  then opens an integrated terminal in the repository, launches the Claude
  driver (`claude --plugin-dir …`), and pre-fills the
  `/autonomous-development:autonomous-feature` skill command. The command is
  typed but not executed — the user presses Enter to launch, keeping a human in
  the loop. Because the skill drives its own `init`, this avoids creating an
  orphan run that nothing drives. The feature text is POSIX single-quoted before
  it reaches the shell, and no permission-bypass flags are ever passed. Available
  only in trusted workspaces, consistent with the other controller actions.

## 0.2.0

Compatibility target: `quaat/autonomous-development` **v0.3.0** (revision
`a72f740`), run-state `schema_version` 2 (versions 1 and 2 supported). The full
contract is recorded in [`docs/REFERENCE.md`](../../docs/REFERENCE.md) and pinned
by [`resources/reference-lock.json`](../../resources/reference-lock.json).

### Added

- **Cumulative review ledger.** The dashboard now renders the controller's
  cumulative findings ledger with resolution provenance (`round_opened`,
  `round_last_seen`, `resolved_at_round`, `resolution_source`). Resolved findings
  are shown as released rather than blocking; severe unresolved findings are
  flagged as blocking from the same authoritative decision the gate uses.
- **Acceptance-criteria matrix.** Every cumulative acceptance criterion is shown
  with its status; any status other than `satisfied` is surfaced as blocking
  (fail closed) — acceptance criteria are no longer treated as informational.
- **Review checkpoints / delta context.** The latest review's checkpoint, changed
  paths, and `focused_full_fallback` review context are presented so a delta
  review's scope is visible.
- **Codex token usage.** Per-phase Codex run instrumentation (duration, tokens)
  is summarized when present.
- **Workflow mode.** The resolved effective mode (`lean`/`standard`/`rigorous`)
  drives a mode-aware recommended next action with exact controller parity,
  including the rigorous-only `enhance` phase.
- **Compatibility guard.** Authoritative schemas are mirrored under
  `resources/schemas/` (now including `review-delta`, `triage`, and
  `accept-decisions`), checksum-pinned in `resources/reference-lock.json`, and
  verified by `npm run verify:reference` (run as part of `npm test`).

### Changed

- The shared workflow evaluator in `@semanticmatter/core` is the single source of
  truth for completion gates and next-action across the tree, dashboard, status
  bar, and commands. Completion now fails closed on a `pass` verdict that
  coexists with blocking findings or unsatisfied criteria.
- `docs/REFERENCE.md` rewritten to match the v0.3.0 controller (gate ordering,
  ledger semantics, terminal/mutation-integrity rules, full CLI surface).

### Security

- Artifact pointers remain confined to the run directory; mirrored schemas are
  documentation/contract resources and are not executed.

## 0.1.0

- Initial observer/control-plane release: run discovery, tree views, workflow
  dashboard, artifact navigation and diffs, status bar, notifications, and
  workspace-trust-gated controller actions.
