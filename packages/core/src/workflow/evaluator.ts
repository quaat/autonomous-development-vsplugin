/**
 * The shared workflow evaluator: the ONE place gate logic and next-action logic
 * live. Tree views, dashboard, status bar, and commands all consume its output
 * (docs/REFERENCE.md §6–§7). Pure and synchronous — IO happens in the caller
 * (see loadRun), which assembles the file-read facts this needs.
 */

import { TERMINAL_STATUSES, type RunState, type RunStatus } from '../types';
import { evaluateGates, gatesPass, type GateFailure } from './gates';
import { latestReviewRef } from './reviews';
import { deriveStages, type StageFacts, type WorkflowStage } from './stages';
import { recommendNextAction, type NextAction } from './nextAction';
import { summarizeVerification, type VerificationSummary } from './verification';

/** Facts about the latest review that require reading the review file. */
export interface LatestReviewFacts {
  readonly readable: boolean;
  /** Verdict from the review file when readable. */
  readonly verdict?: string;
  readonly severeFindingCount: number;
}

export interface EvaluatorInput {
  readonly state: RunState;
  readonly acceptedSpecExists: boolean;
  readonly acceptedPlanExists: boolean;
  /** Undefined when no reviews are recorded; otherwise facts about the latest. */
  readonly latestReview?: LatestReviewFacts;
}

export interface ReviewBudget {
  readonly max: number;
  readonly consumed: number;
  readonly remaining: number;
}

export interface ReviewSummaryModel {
  readonly hasReviews: boolean;
  readonly rounds: number;
  readonly latestRound?: number;
  /** Effective verdict (file when readable, else run-state cache). */
  readonly latestVerdict?: string;
  readonly latestReadable: boolean;
  readonly severeFindingCount: number;
}

export interface AdversarialSummaryModel {
  readonly required: boolean;
  readonly reasons: readonly string[];
  readonly hasReviews: boolean;
  readonly latestRound?: number;
  readonly latestVerdict?: string;
  readonly satisfied: boolean;
}

export interface WorkflowModel {
  readonly runId: string;
  readonly status: RunStatus;
  readonly rawStatus: string;
  readonly phase: string;
  readonly isTerminal: boolean;
  readonly stages: readonly WorkflowStage[];
  readonly verification: VerificationSummary;
  readonly review: ReviewSummaryModel;
  readonly reviewBudget: ReviewBudget;
  readonly adversarial: AdversarialSummaryModel;
  readonly riskClassification: {
    readonly requiresAdversarialReview: boolean;
    readonly reasons: readonly string[];
  };
  readonly completionGateFailures: readonly GateFailure[];
  readonly gatesPass: boolean;
  readonly recommendedNextAction: NextAction;
  readonly blockingReason?: string;
}

function isPass(verdict: string | undefined): boolean {
  return verdict !== undefined && verdict.trim().toLowerCase() === 'pass';
}

function blockingReasonFor(state: RunState): string | undefined {
  if (state.status !== 'blocked') {
    return undefined;
  }
  if (state.phase === 'review-budget-exhausted') {
    return 'Review-round budget exhausted';
  }
  return state.phase && state.phase !== 'blocked' ? state.phase : 'Run is blocked';
}

export function evaluateWorkflow(input: EvaluatorInput): WorkflowModel {
  const { state } = input;

  const verification = summarizeVerification(state.verification.checks);

  const hasReviews = state.reviews.length > 0;
  const latestRef = latestReviewRef(state.reviews);
  const cachedReviewVerdict = latestRef?.verdict;
  const latestReadable = input.latestReview?.readable ?? false;
  const severeFindingCount = input.latestReview?.severeFindingCount ?? 0;
  // Effective verdict: prefer the file when readable, else the run-state cache.
  const effectiveReviewVerdict = latestReadable ? input.latestReview?.verdict : cachedReviewVerdict;

  const adversarialLatest = latestReviewRef(state.adversarialReviews);
  const hasAdversarial = state.adversarialReviews.length > 0;
  const latestAdversarialVerdict = adversarialLatest?.verdict;
  const requiresAdversarial = state.risk.requiresAdversarialReview;

  const completionGateFailures = evaluateGates({
    acceptedSpecExists: input.acceptedSpecExists,
    acceptedPlanExists: input.acceptedPlanExists,
    hasChecks: verification.hasChecks,
    verificationPassed: verification.passed,
    hasReviews,
    latestReviewReadable: latestReadable,
    ...(input.latestReview?.verdict !== undefined
      ? { latestReviewVerdict: input.latestReview.verdict }
      : {}),
    severeFindingCount,
    requiresAdversarial,
    hasAdversarial,
    ...(latestAdversarialVerdict !== undefined ? { latestAdversarialVerdict } : {})
  });

  const recommendedNextAction = recommendNextAction({
    status: state.status,
    hasEnhance: state.artifacts.enhance !== undefined,
    acceptedSpecExists: input.acceptedSpecExists,
    acceptedPlanExists: input.acceptedPlanExists,
    hasChecks: verification.hasChecks,
    verificationPassed: verification.passed,
    hasReviews,
    ...(effectiveReviewVerdict !== undefined ? { effectiveReviewVerdict } : {}),
    requiresAdversarial,
    hasAdversarial,
    ...(latestAdversarialVerdict !== undefined ? { latestAdversarialVerdict } : {})
  });

  const stageFacts: StageFacts = {
    status: state.status,
    hasEnhance: state.artifacts.enhance !== undefined,
    acceptedSpecExists: input.acceptedSpecExists,
    hasPlan: state.artifacts.plan !== undefined,
    acceptedPlanExists: input.acceptedPlanExists,
    hasChecks: verification.hasChecks,
    verificationPassed: verification.passed,
    hasReviews,
    reviewPassed: isPass(effectiveReviewVerdict),
    severeFindingCount,
    requiresAdversarial,
    hasAdversarial,
    adversarialPassed: isPass(latestAdversarialVerdict),
    nextActionCode: recommendedNextAction.code
  };
  const stages = deriveStages(stageFacts);

  const reviewBudget: ReviewBudget = {
    max: state.maxReviewRounds,
    consumed: state.reviewRound,
    remaining: Math.max(0, state.maxReviewRounds - state.reviewRound)
  };

  const review: ReviewSummaryModel = {
    hasReviews,
    rounds: state.reviews.length,
    ...(latestRef?.round !== undefined ? { latestRound: latestRef.round } : {}),
    ...(effectiveReviewVerdict !== undefined ? { latestVerdict: effectiveReviewVerdict } : {}),
    latestReadable,
    severeFindingCount
  };

  const adversarial: AdversarialSummaryModel = {
    required: requiresAdversarial,
    reasons: state.risk.reasons,
    hasReviews: hasAdversarial,
    ...(adversarialLatest?.round !== undefined ? { latestRound: adversarialLatest.round } : {}),
    ...(latestAdversarialVerdict !== undefined ? { latestVerdict: latestAdversarialVerdict } : {}),
    satisfied: !requiresAdversarial || (hasAdversarial && isPass(latestAdversarialVerdict))
  };

  const blockingReason = blockingReasonFor(state);

  return {
    runId: state.runId,
    status: state.status,
    rawStatus: state.rawStatus,
    phase: state.phase,
    isTerminal: TERMINAL_STATUSES.includes(state.status),
    stages,
    verification,
    review,
    reviewBudget,
    adversarial,
    riskClassification: {
      requiresAdversarialReview: requiresAdversarial,
      reasons: state.risk.reasons
    },
    completionGateFailures,
    gatesPass: gatesPass(completionGateFailures),
    recommendedNextAction,
    ...(blockingReason !== undefined ? { blockingReason } : {})
  };
}
