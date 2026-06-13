/**
 * Verification "latest effective" derivation (docs/REFERENCE.md §5).
 *
 * For each logical check `name`, the *last* recorded entry is the effective
 * result; first-seen order is preserved. The run is verified iff there is at
 * least one check and every effective check exited 0.
 */

import type { VerificationCheck } from '../types';

export interface VerificationSummary {
  readonly hasChecks: boolean;
  /** checks non-empty AND every latest-effective check exit_code === 0. */
  readonly passed: boolean;
  /** Distinct logical check count. */
  readonly total: number;
  readonly passedCount: number;
  readonly failedCount: number;
  /** Latest-effective check per name, in first-seen order. */
  readonly latest: readonly VerificationCheck[];
  /** All recorded attempts per logical name (earliest → latest). */
  readonly attemptsByName: Readonly<Record<string, readonly VerificationCheck[]>>;
}

function isPass(check: VerificationCheck): boolean {
  return check.exitCode === 0;
}

export function summarizeVerification(checks: readonly VerificationCheck[]): VerificationSummary {
  const order: string[] = [];
  const attempts = new Map<string, VerificationCheck[]>();

  for (const check of checks) {
    const existing = attempts.get(check.name);
    if (existing) {
      existing.push(check);
    } else {
      attempts.set(check.name, [check]);
      order.push(check.name);
    }
  }

  const latest: VerificationCheck[] = [];
  let passedCount = 0;
  let failedCount = 0;
  for (const name of order) {
    const list = attempts.get(name);
    const effective = list && list.length > 0 ? list[list.length - 1] : undefined;
    if (!effective) {
      continue;
    }
    latest.push(effective);
    if (isPass(effective)) {
      passedCount += 1;
    } else {
      failedCount += 1;
    }
  }

  const attemptsByName: Record<string, readonly VerificationCheck[]> = {};
  for (const name of order) {
    attemptsByName[name] = attempts.get(name) ?? [];
  }

  const hasChecks = latest.length > 0;
  return {
    hasChecks,
    passed: hasChecks && failedCount === 0,
    total: latest.length,
    passedCount,
    failedCount,
    latest,
    attemptsByName
  };
}
