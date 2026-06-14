/**
 * Review parsing + summaries. Severe findings are those with
 * severity ∈ {critical, high} (docs/REFERENCE.md §6 #7). The completion gate
 * counts them *raw* — it never consults triage dispositions.
 */

import { diag, type Diagnostic } from '../diagnostics';
import {
  SEVERE_FINDING_SEVERITIES,
  type AcceptanceCriterionAssessment,
  type ReviewDocument,
  type ReviewFinding,
  type ReviewRef
} from '../types';

/**
 * The latest review reference. The controller authoritatively uses the array
 * tail (`reviews[-1]`) for both the completion gate (`cmd_evaluate`) and
 * next-action derivation (`compute_next_action`), appending each review in
 * order — so the latest review is the last element written, *not* the
 * highest-numbered round. Mirror that exactly: selecting by max `round` would
 * diverge from the gate on a non-monotonic or corrupt round sequence. Returns
 * undefined for an empty list.
 */
export function latestReviewRef(reviews: readonly ReviewRef[]): ReviewRef | undefined {
  return reviews.length > 0 ? reviews[reviews.length - 1] : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeFinding(value: unknown): ReviewFinding | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const finding: {
    id?: string;
    severity?: string;
    category?: string;
    file?: string | null;
    lineStart?: number | null;
    description?: string;
    evidence?: string;
    recommendedFix?: string;
  } = {};
  if (typeof value['id'] === 'string') finding.id = value['id'];
  if (typeof value['severity'] === 'string') finding.severity = value['severity'];
  if (typeof value['category'] === 'string') finding.category = value['category'];
  if (typeof value['file'] === 'string' || value['file'] === null) {
    finding.file = value['file'] as string | null;
  }
  if (typeof value['line_start'] === 'number' || value['line_start'] === null) {
    finding.lineStart = value['line_start'] as number | null;
  }
  if (typeof value['description'] === 'string') finding.description = value['description'];
  if (typeof value['evidence'] === 'string') finding.evidence = value['evidence'];
  if (typeof value['recommended_fix'] === 'string')
    finding.recommendedFix = value['recommended_fix'];
  return finding;
}

function normalizeAssessment(value: unknown): AcceptanceCriterionAssessment | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const item: { id?: string; status?: string; evidence?: string } = {};
  if (typeof value['id'] === 'string') item.id = value['id'];
  if (typeof value['status'] === 'string') item.status = value['status'];
  if (typeof value['evidence'] === 'string') item.evidence = value['evidence'];
  return item;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((v): v is string => typeof v === 'string');
}

/** Normalize already-parsed review JSON into a {@link ReviewDocument}. */
export function normalizeReviewDocument(value: unknown): ReviewDocument {
  if (!isPlainObject(value)) {
    return { findings: [], verificationGaps: [], acceptanceCriteriaAssessment: [], raw: {} };
  }
  const findings: ReviewFinding[] = [];
  const rawFindings = value['findings'];
  if (Array.isArray(rawFindings)) {
    for (const entry of rawFindings) {
      const finding = normalizeFinding(entry);
      if (finding) {
        findings.push(finding);
      }
    }
  }
  const acceptanceCriteriaAssessment: AcceptanceCriterionAssessment[] = [];
  const rawAssessment = value['acceptance_criteria_assessment'];
  if (Array.isArray(rawAssessment)) {
    for (const entry of rawAssessment) {
      const item = normalizeAssessment(entry);
      if (item) {
        acceptanceCriteriaAssessment.push(item);
      }
    }
  }
  const doc: {
    verdict?: string;
    summary?: string;
    confidence?: number;
    findings: ReviewFinding[];
    verificationGaps: string[];
    acceptanceCriteriaAssessment: AcceptanceCriterionAssessment[];
    raw: Record<string, unknown>;
  } = {
    findings,
    verificationGaps: normalizeStringArray(value['verification_gaps']),
    acceptanceCriteriaAssessment,
    raw: value
  };
  if (typeof value['verdict'] === 'string') doc.verdict = value['verdict'];
  if (typeof value['summary'] === 'string') doc.summary = value['summary'];
  if (typeof value['confidence'] === 'number' && Number.isFinite(value['confidence'])) {
    doc.confidence = value['confidence'];
  }
  return doc;
}

export interface ReviewDocumentParseResult {
  readonly document?: ReviewDocument;
  readonly diagnostics: readonly Diagnostic[];
}

/** Parse review JSON text (tolerant). */
export function parseReviewText(text: string, path?: string): ReviewDocumentParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      diagnostics: [diag('review-parse-error', `Invalid review JSON: ${message}`, 'warning', path)]
    };
  }
  return { document: normalizeReviewDocument(parsed), diagnostics: [] };
}

export function isSevereFinding(finding: ReviewFinding): boolean {
  return (
    finding.severity !== undefined &&
    SEVERE_FINDING_SEVERITIES.includes(finding.severity.toLowerCase())
  );
}

export function countSevereFindings(doc: ReviewDocument): number {
  return doc.findings.reduce((n, f) => (isSevereFinding(f) ? n + 1 : n), 0);
}

export function countFindingsBySeverity(doc: ReviewDocument): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of doc.findings) {
    const key = (f.severity ?? 'unknown').toLowerCase();
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
