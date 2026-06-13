/**
 * Recommended next action — the single derivation consumed by tree, dashboard,
 * status bar, and commands (docs/REFERENCE.md §7).
 *
 * Steps 1–8 mirror `stop_gate.py:reason_for` exactly (first match wins). The
 * front of the list is extended defensively for terminal/early states that
 * stop_gate never sees but that the extension must still render; these never
 * contradict stop_gate.
 */

import type { RunStatus } from '../types';

export type NextActionCode =
  | 'none'
  | 'blocked'
  | 'run-enhance'
  | 'reconcile-spec'
  | 'reconcile-plan'
  | 'run-verification'
  | 'fix-verification'
  | 'run-review'
  | 'triage-findings'
  | 'adversarial-review'
  | 'evaluate-report';

export interface NextAction {
  readonly code: NextActionCode;
  readonly message: string;
}

const MESSAGES: Readonly<Record<NextActionCode, string>> = {
  none: '',
  blocked: 'Review the blocking reason; cancel or start a new run',
  'run-enhance': 'Run Codex enhance',
  'reconcile-spec': 'Reconcile the Codex proposal and create accepted-spec.md',
  'reconcile-plan': 'Reconcile the Codex plan and create accepted-plan.md',
  'run-verification': 'Run and record relevant verification checks',
  'fix-verification': 'Fix the failing verification checks and rerun them',
  'run-review': 'Run the independent Codex code review',
  'triage-findings': 'Triage the latest Codex findings, fix valid issues, verify, and re-review',
  'adversarial-review': 'Complete the required adversarial review and address valid risks',
  'evaluate-report':
    'Run the controller completion-gate evaluation and provide the final implementation report'
};

export function nextAction(code: NextActionCode): NextAction {
  return { code, message: MESSAGES[code] };
}

export interface NextActionFacts {
  readonly status: RunStatus;
  readonly hasEnhance: boolean;
  readonly acceptedSpecExists: boolean;
  readonly acceptedPlanExists: boolean;
  readonly hasChecks: boolean;
  readonly verificationPassed: boolean;
  readonly hasReviews: boolean;
  /** Verdict used for step 6: file verdict when readable, else run-state cache. */
  readonly effectiveReviewVerdict?: string;
  readonly requiresAdversarial: boolean;
  readonly hasAdversarial: boolean;
  readonly latestAdversarialVerdict?: string;
}

function isPass(verdict: string | undefined): boolean {
  return verdict !== undefined && verdict.trim().toLowerCase() === 'pass';
}

export function recommendNextAction(f: NextActionFacts): NextAction {
  // Defensive front extensions (no stop_gate equivalent; never contradict it).
  if (f.status === 'cancelled' || f.status === 'archived' || f.status === 'complete') {
    return nextAction('none');
  }
  if (f.status === 'blocked') {
    return nextAction('blocked');
  }
  if (!f.hasEnhance) {
    return nextAction('run-enhance');
  }

  // stop_gate.py:reason_for — first match wins.
  if (!f.acceptedSpecExists) {
    return nextAction('reconcile-spec');
  }
  if (!f.acceptedPlanExists) {
    return nextAction('reconcile-plan');
  }
  if (!f.hasChecks) {
    return nextAction('run-verification');
  }
  if (!f.verificationPassed) {
    return nextAction('fix-verification');
  }
  if (!f.hasReviews) {
    return nextAction('run-review');
  }
  if (!isPass(f.effectiveReviewVerdict)) {
    return nextAction('triage-findings');
  }
  if (f.requiresAdversarial && (!f.hasAdversarial || !isPass(f.latestAdversarialVerdict))) {
    return nextAction('adversarial-review');
  }
  return nextAction('evaluate-report');
}
