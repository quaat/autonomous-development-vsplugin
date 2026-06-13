/**
 * The 12-stage *workflow* timeline (distinct from the protocol event timeline).
 * Derived from the same facts the evaluator uses, so the dashboard, tree, and
 * status bar never disagree about where a run is.
 */

import type { RunStatus } from '../types';
import type { NextActionCode } from './nextAction';

export type StageStatus =
  | 'complete'
  | 'active'
  | 'pending'
  | 'failed'
  | 'blocked'
  | 'cancelled'
  | 'skipped';

export type StageId =
  | 'initialized'
  | 'idea-enhanced'
  | 'spec-accepted'
  | 'plan-proposed'
  | 'plan-accepted'
  | 'implementing'
  | 'verification'
  | 'independent-review'
  | 'triage'
  | 'adversarial-review'
  | 'completion-evaluation'
  | 'final';

export interface WorkflowStage {
  readonly id: StageId;
  readonly title: string;
  readonly status: StageStatus;
  readonly detail?: string;
}

export interface StageFacts {
  readonly status: RunStatus;
  readonly hasEnhance: boolean;
  readonly acceptedSpecExists: boolean;
  readonly hasPlan: boolean;
  readonly acceptedPlanExists: boolean;
  readonly hasChecks: boolean;
  readonly verificationPassed: boolean;
  readonly hasReviews: boolean;
  readonly reviewPassed: boolean;
  readonly severeFindingCount: number;
  readonly requiresAdversarial: boolean;
  readonly hasAdversarial: boolean;
  readonly adversarialPassed: boolean;
  readonly nextActionCode: NextActionCode;
}

const STAGE_ORDER: ReadonlyArray<{ id: StageId; title: string }> = [
  { id: 'initialized', title: 'Initialized' },
  { id: 'idea-enhanced', title: 'Idea Enhanced' },
  { id: 'spec-accepted', title: 'Specification Accepted' },
  { id: 'plan-proposed', title: 'Plan Proposed' },
  { id: 'plan-accepted', title: 'Plan Accepted' },
  { id: 'implementing', title: 'Implementing' },
  { id: 'verification', title: 'Verification' },
  { id: 'independent-review', title: 'Independent Review' },
  { id: 'triage', title: 'Finding Triage and Fixes' },
  { id: 'adversarial-review', title: 'Adversarial Review' },
  { id: 'completion-evaluation', title: 'Completion Evaluation' },
  { id: 'final', title: 'Complete, Blocked, or Cancelled' }
];

/** Stage that the recommended next action targets (the "active" stage). */
const NEXT_ACTION_STAGE: Readonly<Record<NextActionCode, StageId>> = {
  'run-enhance': 'idea-enhanced',
  'reconcile-spec': 'spec-accepted',
  'reconcile-plan': 'plan-accepted',
  'run-verification': 'verification',
  'fix-verification': 'verification',
  'run-review': 'independent-review',
  'triage-findings': 'triage',
  'adversarial-review': 'adversarial-review',
  'evaluate-report': 'completion-evaluation',
  blocked: 'final',
  none: 'final'
};

/** Evidence that each stage's primary deliverable is complete. */
function reached(id: StageId, f: StageFacts): boolean {
  switch (id) {
    case 'initialized':
      return true;
    case 'idea-enhanced':
      return f.hasEnhance;
    case 'spec-accepted':
      return f.acceptedSpecExists;
    case 'plan-proposed':
      return f.hasPlan;
    case 'plan-accepted':
      return f.acceptedPlanExists;
    case 'implementing':
      // Implementation is "done enough" once verification has been attempted.
      return f.hasChecks;
    case 'verification':
      return f.hasChecks && f.verificationPassed;
    case 'independent-review':
      return f.hasReviews && f.reviewPassed;
    case 'triage':
      return f.hasReviews && f.reviewPassed && f.severeFindingCount === 0;
    case 'adversarial-review':
      return !f.requiresAdversarial || (f.hasAdversarial && f.adversarialPassed);
    case 'completion-evaluation':
      return f.status === 'complete';
    case 'final':
      return f.status === 'complete';
  }
}

function indexOf(id: StageId): number {
  return STAGE_ORDER.findIndex((s) => s.id === id);
}

export function deriveStages(f: StageFacts): WorkflowStage[] {
  const activeIndex = indexOf(NEXT_ACTION_STAGE[f.nextActionCode]);
  const terminalBlocked = f.status === 'blocked';
  const terminalCancelled = f.status === 'cancelled';
  const terminalArchived = f.status === 'archived';
  const isComplete = f.status === 'complete';
  const halted = terminalBlocked || terminalCancelled;

  // Stop point for halted runs: the first incomplete, non-skipped stage.
  let haltIndex = STAGE_ORDER.length - 1;
  if (halted) {
    for (let i = 0; i < STAGE_ORDER.length; i++) {
      const stage = STAGE_ORDER[i];
      if (!stage) continue;
      if (stage.id === 'adversarial-review' && !f.requiresAdversarial) continue;
      if (stage.id === 'final') continue;
      if (!reached(stage.id, f)) {
        haltIndex = i;
        break;
      }
    }
  }

  return STAGE_ORDER.map((stage, i): WorkflowStage => {
    const base = { id: stage.id, title: stage.title };

    if (stage.id === 'adversarial-review' && !f.requiresAdversarial) {
      return { ...base, status: 'skipped', detail: 'Not required by risk gate' };
    }

    if (stage.id === 'final') {
      if (isComplete) return { ...base, status: 'complete' };
      if (terminalBlocked) return { ...base, status: 'blocked' };
      if (terminalCancelled) return { ...base, status: 'cancelled' };
      if (terminalArchived) {
        return { ...base, status: reached('completion-evaluation', f) ? 'complete' : 'skipped' };
      }
      return { ...base, status: 'pending' };
    }

    if (reached(stage.id, f)) {
      return { ...base, status: 'complete' };
    }

    if (isComplete) {
      // Complete run with an un-evidenced earlier stage: treat as complete.
      return { ...base, status: 'complete' };
    }

    if (terminalArchived) {
      return { ...base, status: 'skipped' };
    }

    if (halted) {
      if (i === haltIndex) {
        return { ...base, status: terminalBlocked ? 'blocked' : 'cancelled' };
      }
      return { ...base, status: 'skipped' };
    }

    // Active (non-terminal) run.
    if (i === activeIndex) {
      if (stage.id === 'verification' && f.hasChecks && !f.verificationPassed) {
        return { ...base, status: 'failed' };
      }
      return { ...base, status: 'active' };
    }
    if (i < activeIndex) {
      return { ...base, status: 'complete' };
    }
    return { ...base, status: 'pending' };
  });
}
