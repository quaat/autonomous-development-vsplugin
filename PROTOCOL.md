# RunEvent protocol

The extension defines a versioned, append-only event log so that the existing
controller (and, later, live Claude/Codex integrations) can emit a structured
record of a run. The log lives at `<run-dir>/events.jsonl`: one JSON object per
line. It is **optional** — observer features derive everything they need from
`run-state.json` and the artifacts; the event log enriches the dashboard timeline
when present.

- TypeScript source of truth: `packages/protocol/src/events.ts`.
- JSON Schema: [`resources/schemas/run-event.schema.json`](resources/schemas/run-event.schema.json).

## Envelope

```jsonc
{
  "schemaVersion": 1, // integer; bumped only on breaking changes
  "sequence": 1, // monotonic, per-run, starting at 1
  "timestamp": "2026-06-12T10:00:00Z", // ISO-8601
  "runId": "RUN-abc",
  "repositoryId": "demo-repo",
  "phase": "implementing", // free-form phase string at emission time
  "source": "controller", // controller | extension | claude-agent | codex | …
  "type": "verification.completed",
  "correlationId": "…", // optional; ties related events together
  "payload": {
    /* type-specific; consumers narrow by `type` */
  }
}
```

`payload` is intentionally `unknown` at the protocol layer; each consumer narrows
it per `type`. Any envelope field **not** listed above is preserved verbatim by
the parser (on `RunEvent.extra`) rather than dropped.

## Known event types (v1)

Run lifecycle: `run.created`, `run.status.changed`, `phase.started`,
`phase.completed`, `phase.failed`.
Prompts & artifacts: `prompt.rendered`, `prompt.reconciled`, `artifact.created`,
`artifact.accepted`.
Agents & tools: `agent.message.completed`, `tool.started`, `tool.completed`.
Files & plan: `file.change.proposed`, `file.change.applied`, `plan.step.started`,
`plan.step.completed`, `plan.step.blocked`.
Verification: `verification.started`, `verification.output`,
`verification.completed`.
Review: `review.started`, `review.finding.created`, `review.finding.triaged`,
`review.finding.resolved`, `review.completed`.
Gates & approvals: `gate.changed`, `drift.detected`, `approval.requested`,
`approval.resolved`.

This list is **not exhaustive at runtime**. A well-formed envelope carrying an
unrecognized `type` is still valid and is preserved.

### Consumed payloads

The envelope is generic, but the dashboard reads a few payload shapes when present:

- `review.finding.triaged` — `{ "findingId": string, "disposition": string }`. The
  `disposition` is shown on the matching finding only when it is one of the
  recognized values (`accepted`, `rejected_with_evidence`, `already_resolved`,
  `out_of_scope_but_recorded`, `requires_human_decision`); unknown values are
  ignored. The latest triage for a `findingId` wins. Legacy `triage-NN.md`
  markdown is never parsed into a disposition — it is shown read-only.

An event whose `runId`/`repositoryId` disagrees with the run-state it lives beside
is surfaced as a non-fatal `event-log-disagreement` diagnostic; run-state remains
authoritative.

## Compatibility rules

Forward compatibility is a first-class requirement. The reader
(`parseEventLog`) guarantees:

1. **Unknown `type` values are kept**, not rejected — they flow through to the
   timeline labeled generically.
2. **Unknown envelope fields are preserved** verbatim on `extra`.
3. **A truncated final line is tolerated.** A partially written last record (the
   common consequence of reading mid-append) is reported as a diagnostic and
   skipped; all complete prior lines parse normally.
4. **Sequence is expected to be monotonic** and 1-based. Gaps or non-monotonic
   sequences are reported as diagnostics but do not abort parsing.
5. **Duplicate `(runId, sequence)` records are de-duplicated**; the first wins.
6. **Records from a newer `schemaVersion`** are not hard-failed; they are read
   best-effort so an older extension keeps working against a newer emitter.

Breaking changes require bumping `RUN_EVENT_SCHEMA_VERSION`. Because consumers
tolerate unknown types and fields, additive changes (new event types, new payload
or envelope fields) are **not** breaking and do not require a version bump.

## Timeline reconstruction

`reconstructTimeline` turns the parsed events into an ordered, human-readable
sequence for the dashboard, mapping known types to concise summaries and falling
back to the raw `type` for unknown ones. The UI caps in-memory events per run at
`autonomousDev.maxEventLogEntries`.
