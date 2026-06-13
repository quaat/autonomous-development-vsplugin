# Reference: quaat/autonomous-development compatibility contract

This document records the **authoritative** state layout, schemas, controller
interface, completion-gate logic, lifecycle, and safety boundaries of the
`quaat/autonomous-development` plugin, as derived directly from its source
(`scripts/state.py`, `scripts/controller.py`, `schemas/*.json`, `prompts/*.md`,
`SECURITY.md`). The SemanticMatter Autonomous Development extension must remain
compatible with everything described here. **When compatibility is uncertain,
preserve the reference behavior and record the uncertainty — never invent a new
interpretation.**

> Source of truth precedence: the reference Python source > this document > UI code.
> If this document and the reference disagree, the reference wins; fix this doc.

## 1. State-home resolution (precedence)

1. Explicit override (CLI `--state-dir`; in the extension: the
   `autonomousDev.stateHome` setting).
2. `CLAUDE_AUTONOMOUS_STATE_HOME` environment variable.
3. Platform default:
   - **macOS** (`darwin`): `~/Library/Application Support/claude-autonomous`
   - **Windows** (`win32`): `%LOCALAPPDATA%/claude-autonomous`, else
     `~/AppData/Local/claude-autonomous`
   - **Linux/other**: `$XDG_STATE_HOME/claude-autonomous` if `XDG_STATE_HOME`
     set, else `~/.local/state/claude-autonomous`

Paths are `expanduser()`-ed and resolved. Note the Linux default base is
`~/.local/**state**` (not `.local/share`).

## 2. Directory layout

```
<state-home>/
  repositories/
    <repo-id>/
      metadata.json
      runs/
        <run-id>/
          run-state.json
          feature-request.md
          repository-context.txt
          accepted-spec.md
          accepted-plan.md
          feature-spec.codex.json            # enhance output
          implementation-plan.codex.json      # plan output
          enhance.prompt.md / plan.prompt.md / review.prompt.md / adversarial.prompt.md
          review-NN.codex.json                # NN = zero-padded round (01..)
          adversarial-NN.codex.json
          triage-NN.md                        # Claude triage, free-form markdown
          verification/
            NN-<slug>.log                      # one per recorded check
          .run-state.lock                      # fcntl lock file (ignore in UI)
          events.jsonl                         # NEW: emitted by this project's protocol
```

- **repo-id**: 16 hex chars = `sha256(git_common_dir + "\n" + first_commit)[:16]`.
- **run-id**: `<YYYYMMDDTHHMMSSZ>-<8 hex>` (UTC), e.g. `20260612T201323Z-96954900`.
- **Legacy layout** (read-only inspection only): `<repo>/.ai/autonomous-development/run-state.json`.
  Detected when that file exists. Deprecated; never written by this extension.

## 3. run-state.json (schema_version 2)

Written atomically (`.tmp` then `replace`) as `json.dumps(indent=2, sort_keys=True) + "\n"`.
Watchers must handle atomic replace (rename) and partial writes.

Canonical shape (from `cmd_init`, mutated by other commands):

```jsonc
{
  "schema_version": 2,                  // or legacy "version"; supported: 1, 2
  "run_id": "20260612T201323Z-96954900",
  "label": "optional-slug",
  "feature": "<original feature text>",
  "status": "active",                   // active|complete|blocked|cancelled|archived
  "phase": "initialized",               // see §4
  "created_at": "ISO-8601 seconds",
  "updated_at": "ISO-8601 seconds",     // refreshed on every save
  "repository": {
    "id": "8dd906752e640877",
    "canonical_root": "/abs/path",
    "git_common_dir": "/abs/path/.git",
    "worktree_path": "/abs/path",
    "display_name": "repo-name",
    "remote_display": "https://host/org/repo"   // credentials already stripped
  },
  "baseline": {
    "commit": "<40-hex>",
    "branch": "main",
    "dirty_entries_at_init": ["?? foo", " M bar"]  // git status --short lines
  },
  "max_review_rounds": 3,               // 1..5
  "review_round": 0,
  "stop_gate_blocks": 0,
  "artifacts": {                        // values are run-dir-relative paths (or abs)
    "feature_request": "feature-request.md",
    "repository_context": "repository-context.txt",
    "enhance": "feature-spec.codex.json",        // set after codex enhance
    "accepted_spec": "accepted-spec.md",         // set after accept --kind spec
    "plan": "implementation-plan.codex.json",    // set after codex plan
    "accepted_plan": "accepted-plan.md",         // set after accept --kind plan
    "review": "review-01.codex.json",            // latest review path
    "adversarial": "adversarial-01.codex.json"
  },
  "verification": {
    "passed": false,
    "checks": [
      {
        "name": "unit-tests",
        "command": ["npm", "test"],
        "exit_code": 0,
        "log": "verification/01-unit-tests.log",
        "started_at": "ISO",
        "completed_at": "ISO"
      }
    ]
  },
  "reviews": [
    { "round": 1, "path": "review-01.codex.json", "verdict": "changes_required" }
  ],
  "adversarial_reviews": [
    { "round": 1, "path": "adversarial-01.codex.json", "verdict": "pass" }
  ],
  "risk": { "requires_adversarial_review": false, "reasons": [] },
  "notes": ["free-form strings"],
  "completion_gate_failures": ["set by evaluate"],
  // migration-only fields:
  "migrated_from": "v1" | "<legacy dir>",
  "migrated_at": "ISO"
}
```

Required for validity: `status` (string) and `run_id` (string). `schema_version`
(or `version`) must be in {1, 2} if present.

## 4. Phase strings & lifecycle (who sets what)

| Controller action                | status        | phase                      |
| -------------------------------- | ------------- | -------------------------- |
| `init`                           | active        | `initialized`              |
| `codex --phase enhance`          | active        | `idea-enhanced`            |
| `accept --kind spec`             | active        | `spec-accepted`            |
| `codex --phase plan`             | active        | `plan-proposed`            |
| `accept --kind plan`             | active        | `plan-accepted`            |
| `set-phase --phase implementing` | active        | `implementing` (free-form) |
| `run-check` (all latest pass)    | active        | `verified`                 |
| `run-check` (any latest fails)   | active        | `verification-failed`      |
| `codex --phase review`           | active        | `reviewed`                 |
| review budget exceeded           | **blocked**   | `review-budget-exhausted`  |
| `codex --phase adversarial`      | active        | `adversarially-reviewed`   |
| `evaluate` (gates fail)          | active        | `completion-gates-failed`  |
| `evaluate` (gates pass)          | **complete**  | `complete`                 |
| `cancel`                         | **cancelled** | `cancelled`                |
| `block`                          | **blocked**   | `blocked`                  |
| `archive-run`                    | **archived**  | (unchanged)                |

`phase` is free-form (set-phase accepts anything), so the extension must **derive**
its stage model defensively from `status` + `phase` + artifacts + reviews +
verification + risk, never assume an exact phase string.

Terminal statuses: `{complete, blocked, cancelled, archived}`.

## 5. Verification "latest effective" rule

`latest_verification_checks`: iterate `checks` in order; for each `name`, the
**last** entry with that name is the effective result; ordering preserves
first-seen. `verification.passed = checks_nonempty AND all(effective.exit_code == 0)`.
The UI must show the latest effective result per logical name while still letting
earlier attempts be inspected.

## 6. Completion-gate logic (replicate exactly — `cmd_evaluate`)

Gate FAILS (status stays `active`, phase `completion-gates-failed`) if **any**:

1. `accepted-spec.md` missing.
2. `accepted-plan.md` missing.
3. No verification checks recorded.
4. Any **latest-effective** check has `exit_code != 0`.
5. No reviews recorded.
6. Latest review unreadable, OR latest review `verdict != "pass"`.
7. Latest review has ≥1 finding with `severity ∈ {critical, high}`
   (**raw count — controller does NOT consult triage dispositions**).
8. If `risk.requires_adversarial_review`: no adversarial review recorded, OR
   latest adversarial `verdict != "pass"`.

All pass ⇒ status `complete`, phase `complete`, `completion_gate_failures = []`.

> The core evaluator reproduces this for parity, and additionally surfaces triage
> dispositions in the UI (informational) without changing the gate result.

## 7. Recommended next action (derived, single source)

Derived in `packages/core` from the same inputs as the gate. This logic lives in
exactly one place; tree/dashboard/status bar/commands all consume it.

**Authoritative precedence — mirrors `stop_gate.py:reason_for` exactly.** The
reference checks these in order and returns the first match. The core evaluator
MUST reproduce this ordering for parity (verification uses the latest-effective
check per name, §5):

1. `accepted-spec.md` missing ⇒ "Reconcile the Codex proposal and create accepted-spec.md".
2. `accepted-plan.md` missing ⇒ "Reconcile the Codex plan and create accepted-plan.md".
3. No verification checks ⇒ "Run and record relevant verification checks".
4. Any latest-effective check `exit_code != 0` ⇒ "Fix the failing verification checks and rerun them".
5. No reviews ⇒ "Run the independent Codex code review".
6. Latest review `verdict != "pass"` ⇒ "Triage the latest Codex findings, fix valid issues, verify, and re-review".
7. `risk.requires_adversarial_review` AND (no adversarial review OR latest adversarial `verdict != "pass"`) ⇒ "Complete the required adversarial review and address valid risks".
8. Otherwise ⇒ "Run the controller completion-gate evaluation and provide the final implementation report".

**Parity nuances** (so the next-action stays coherent with the gate, §6):

- `stop_gate.py` keys step 6 on **verdict only** — it does NOT separately test for
  severe (critical/high) findings. The completion gate (§6 #7) DOES fail on raw
  severe findings even when `verdict == "pass"`. The evaluator therefore returns
  the step-8 "evaluate" action in that edge case (matching stop_gate), while
  `completion_gate_failures` separately surfaces the severe-finding reason. Do not
  invent a distinct next-action string for the verdict==pass + severe-findings case.
- `stop_gate.py` enters at step 1 (it is only invoked after a run exists), so the
  extension extends the **front** of this list defensively for earlier/terminal
  states it must also render (these have no stop_gate equivalent but never
  contradict it):
  - status cancelled/archived ⇒ none (terminal).
  - status blocked ⇒ "Review the blocking reason; cancel or start a new run".
  - no `enhance` artifact ⇒ "Run Codex enhance".
  - `enhance` present but no `accepted_spec` ⇒ falls into step 1 above.
  - status complete ⇒ none.

## 8. Codex artifact JSON schemas

- **feature-spec.codex.json** (`enhanced-idea.schema.json`): `title`,
  `problem_statement`, `user_outcomes[]`, `functional_requirements[]`
  `{id:FR-N, requirement, priority:must|should|could, evidence}`,
  `non_functional_requirements[]`, `acceptance_criteria[]`
  `{id:AC-N, criterion, verification}`, `assumptions[]`, `open_questions[]`
  `{question, recommended_default, blocking}`, `risks[]`
  `{risk, severity, mitigation}`, `non_goals[]`.
- **implementation-plan.codex.json** (`implementation-plan.schema.json`):
  `summary`, `current_state[]`, `architecture_decisions[]`
  `{decision, rationale, alternatives_rejected[]}`, `implementation_steps[]`
  `{order, description, files[], dependencies[], validation}`,
  `files_expected_to_change[]` `{path, change, confidence:0..1}`,
  `data_and_api_changes{public_api[], data_model[], migration[], compatibility[]}`,
  `test_strategy{unit[], integration[], end_to_end[], static_checks[], manual_or_runtime[]}`,
  `rollback_strategy[]`, `risks[]`, `non_goals[]`, `definition_of_done[]`.
- **review-NN.codex.json** (`review.schema.json`): `verdict:pass|changes_required|blocked`,
  `summary`, `findings[]` `{id:F-N, severity:critical|high|medium|low,
category:correctness|security|reliability|performance|maintainability|testing|compatibility|documentation,
file:string|null, line_start:int|null, description, evidence, recommended_fix}`,
  `verification_gaps[]`, `acceptance_criteria_assessment[]`
  `{id, status:satisfied|partially_satisfied|not_satisfied|not_verifiable, evidence}`,
  `confidence:0..1`.
- **adversarial-NN.codex.json** (`adversarial-review.schema.json`): `verdict`,
  `summary`, `threats[]` `{severity, area, scenario, evidence, mitigation}`,
  `failure_scenarios[]`, `required_actions[]`, `confidence:0..1`.

`file`/`line_start` may be null; when both present, "open finding location" opens
`<worktree>/<file>:<line_start>`.

## 9. Triage dispositions (UI semantics)

Structured dispositions the dashboard recognises (mapped from triage content /
future events): `accepted`, `rejected_with_evidence`, `already_resolved`,
`out_of_scope_but_recorded`, `requires_human_decision`. Legacy runs only have
`triage-NN.md` (free-form markdown) — show them read-only; never fabricate a
structured disposition for them.

## 10. Controller CLI (adapter contract)

Global: `--project-root <dir>`, `--state-dir <dir>`, `--run-id <id>`. Subcommands
the extension adapter invokes (always as an **argv array**, never a shell string):

| Subcommand     | Args                     | Mutating |
| -------------- | ------------------------ | -------- |
| `doctor`       | —                        | no       |
| `list-runs`    | `--json` `[--all]`       | no       |
| `show-run`     | `--run-id <id>` `--json` | no       |
| `status`       | `--json`                 | no       |
| `evaluate`     | —                        | writes   |
| `accept-drift` | —                        | writes   |
| `cancel`       | `[--reason <s>]`         | writes   |
| `archive-run`  | —                        | writes   |

(Also exist but out of initial adapter scope: `init`, `codex`, `accept`,
`run-check`, `set-phase`, `set-risk`, `block`, `migrate-legacy-state`.)

Adapter rules: always pass explicit `--project-root` and (for run-scoped commands)
`--run-id`; never rely on the "single active run" fallback. Mutating commands are
disabled in untrusted workspaces and require explicit confirmation.

`list-runs --json` / `status --json` print the run-state object(s) verbatim.
`list-runs` default excludes archived/terminal; `--all` includes them.

## 11. Safety boundaries (must preserve)

- Codex planning/review run `codex exec --sandbox read-only` — never editing.
- Never push, merge, publish, deploy, rotate/expose credentials, apply
  irreversible migrations, delete unrelated changes, or weaken checks to pass.
- Disable execution/mutation commands in untrusted workspaces.
- Strict CSP + restricted local resource roots in webviews; never pass env vars
  or credentials to webview code.
- Prefer process execution with argv arrays over shells.
- Redact credential-bearing remote URLs (userinfo) — see `_strip_credentials`.
- Do not log full prompts/artifacts by default (may contain source or secrets).
