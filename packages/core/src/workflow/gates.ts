/**
 * Completion-gate logic — replicates `cmd_evaluate` exactly
 * (docs/REFERENCE.md §6). The gate FAILS (run stays active) if ANY check below
 * fails. It counts severe findings *raw* and never consults triage dispositions.
 */

export type GateFailureCode =
  | 'missing-accepted-spec'
  | 'missing-accepted-plan'
  | 'no-verification'
  | 'verification-failing'
  | 'no-reviews'
  | 'review-not-pass'
  | 'severe-findings'
  | 'adversarial-required';

export interface GateFailure {
  readonly code: GateFailureCode;
  readonly message: string;
}

export interface GateFacts {
  readonly acceptedSpecExists: boolean;
  readonly acceptedPlanExists: boolean;
  readonly hasChecks: boolean;
  readonly verificationPassed: boolean;
  readonly hasReviews: boolean;
  readonly latestReviewReadable: boolean;
  readonly latestReviewVerdict?: string;
  readonly severeFindingCount: number;
  readonly requiresAdversarial: boolean;
  readonly hasAdversarial: boolean;
  readonly latestAdversarialVerdict?: string;
}

function isPass(verdict: string | undefined): boolean {
  return verdict !== undefined && verdict.trim().toLowerCase() === 'pass';
}

/** Ordered completion-gate failures (empty ⇒ gate passes ⇒ run may complete). */
export function evaluateGates(f: GateFacts): GateFailure[] {
  const failures: GateFailure[] = [];

  if (!f.acceptedSpecExists) {
    failures.push({
      code: 'missing-accepted-spec',
      message: 'Accepted specification (accepted-spec.md) is missing'
    });
  }
  if (!f.acceptedPlanExists) {
    failures.push({
      code: 'missing-accepted-plan',
      message: 'Accepted plan (accepted-plan.md) is missing'
    });
  }
  if (!f.hasChecks) {
    failures.push({
      code: 'no-verification',
      message: 'No verification checks have been recorded'
    });
  } else if (!f.verificationPassed) {
    failures.push({
      code: 'verification-failing',
      message: 'One or more verification checks are failing'
    });
  }
  if (!f.hasReviews) {
    failures.push({ code: 'no-reviews', message: 'No independent review has been recorded' });
  } else {
    if (!f.latestReviewReadable || !isPass(f.latestReviewVerdict)) {
      failures.push({
        code: 'review-not-pass',
        message: f.latestReviewReadable
          ? `Latest review verdict is "${f.latestReviewVerdict ?? 'unknown'}", not "pass"`
          : 'Latest review could not be read'
      });
    }
    if (f.severeFindingCount > 0) {
      failures.push({
        code: 'severe-findings',
        message: `Latest review has ${f.severeFindingCount} unresolved critical/high finding(s)`
      });
    }
  }
  if (f.requiresAdversarial && (!f.hasAdversarial || !isPass(f.latestAdversarialVerdict))) {
    failures.push({
      code: 'adversarial-required',
      message: f.hasAdversarial
        ? 'Adversarial review is required and its latest verdict is not "pass"'
        : 'Adversarial review is required but none has been recorded'
    });
  }

  return failures;
}

export function gatesPass(failures: readonly GateFailure[]): boolean {
  return failures.length === 0;
}
