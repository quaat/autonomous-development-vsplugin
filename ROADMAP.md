# Roadmap

This first release is deliberately an **observer + protocol foundation**. It
visualizes and safely controls runs created by the existing
`quaat/autonomous-development` workflow, and it introduces the typed `RunEvent`
log so later live integrations have a stable contract to emit against. It does
**not** orchestrate Claude or Codex directly.

## Shipped (v0.1)

- Read-only discovery and visualization of active/completed/archived runs.
- Workflow dashboard: stages, status, artifact chain, verification, reviews,
  adversarial-review state, gates, and the recommended next action — all from the
  shared core evaluator.
- Native-diff comparisons and finding-to-source navigation.
- Safe, trust-gated controller actions invoked via argv arrays.
- The versioned, forward-compatible `events.jsonl` protocol
  ([PROTOCOL.md](PROTOCOL.md)) with tolerant parsing and timeline reconstruction.
- Type-only adapter contracts for future live integrations
  (`packages/core/src/adapters`): `RunEventSource`, `RunEventSink`,
  `ClaudeAgentAdapter`, `CodexAppServerAdapter`, and their descriptors.

## Next: live event emission

Extend a thin adapter around the existing controller to **emit `RunEvent`s** as a
run progresses, so the dashboard timeline updates live instead of being
reconstructed only from `run-state.json` snapshots. This is purely additive to the
protocol (new event instances, not new envelope semantics).

## Later: Claude Agent SDK adapter

Implement `ClaudeAgentAdapter` against the Claude Agent SDK to surface
agent-message and tool events (`agent.message.completed`, `tool.started`,
`tool.completed`) through the same `RunEventSink`. Planning and review remain
read-only; orchestration stays inside the existing workflow's safety boundaries.

## Later: Codex app-server adapter

Implement `CodexAppServerAdapter` against the Codex app-server to stream review
rounds and findings (`review.started`, `review.finding.created`,
`review.completed`) as structured events rather than post-hoc file reads.

## Explicit non-goals

Out of scope for the foreseeable roadmap (and entirely for this release):

- Rewriting the Python controller in TypeScript.
- Embedding or managing Claude/Codex credentials, billing, or accounts.
- Cloud sync of state or multi-user collaboration.
- Automatically modifying the target repository, or creating commits, branches,
  PRs, pushes, merges, or deployments.
- Exposing hidden model reasoning / chain-of-thought.

Each live adapter will preserve the boundaries in [SECURITY.md](SECURITY.md):
read-only planning/review, no push/merge/deploy, no credential exposure, and full
workspace-trust gating.
