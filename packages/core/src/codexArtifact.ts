/**
 * Semantic summaries of the structured Codex JSON artifacts (the enhanced
 * feature spec and the proposed implementation plan). The dashboard renders
 * these as collapsible sections so a reviewer can scan requirements, acceptance
 * criteria, risks, plan steps, expected files, etc. without opening each file
 * (accepted-plan: "present semantic summaries where structured JSON exists").
 *
 * Tolerant by construction: any read/parse failure or unexpected shape yields an
 * empty summary rather than throwing — a malformed artifact must never crash the
 * view. Keys are matched leniently (snake_case Codex keys plus a few camelCase
 * aliases) so minor emitter drift still produces a useful summary.
 */

import { readFileSync } from 'node:fs';

export interface CodexArtifactSection {
  readonly label: string;
  readonly items: readonly string[];
}

interface SectionSpec {
  readonly keys: readonly string[];
  readonly label: string;
}

/**
 * Ordered sections for the enhanced feature spec (feature-spec.codex.json) and
 * the proposed plan (implementation-plan.codex.json). Both sets are scanned; an
 * artifact only carries one set, so a single ordered union renders cleanly.
 */
const SECTION_SPECS: readonly SectionSpec[] = [
  // Enhanced feature spec.
  { keys: ['problem_statement', 'problemStatement'], label: 'Problem statement' },
  { keys: ['user_outcomes', 'userOutcomes'], label: 'User outcomes' },
  {
    keys: ['functional_requirements', 'functionalRequirements', 'requirements'],
    label: 'Functional requirements'
  },
  {
    keys: ['non_functional_requirements', 'nonFunctionalRequirements'],
    label: 'Non-functional requirements'
  },
  { keys: ['acceptance_criteria', 'acceptanceCriteria'], label: 'Acceptance criteria' },
  { keys: ['assumptions'], label: 'Assumptions' },
  { keys: ['open_questions', 'openQuestions'], label: 'Open questions' },
  // Proposed implementation plan.
  { keys: ['summary'], label: 'Summary' },
  { keys: ['architecture_decisions', 'architectureDecisions'], label: 'Architecture decisions' },
  { keys: ['implementation_steps', 'implementationSteps', 'steps'], label: 'Implementation steps' },
  {
    keys: ['files_expected_to_change', 'filesExpectedToChange', 'expectedFiles'],
    label: 'Expected files'
  },
  { keys: ['test_strategy', 'testStrategy'], label: 'Test strategy' },
  { keys: ['rollback_strategy', 'rollbackStrategy'], label: 'Rollback strategy' },
  { keys: ['definition_of_done', 'definitionOfDone'], label: 'Definition of done' },
  // Shared between both artifacts.
  { keys: ['risks'], label: 'Risks' },
  { keys: ['non_goals', 'nonGoals'], label: 'Non-goals' }
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scalarToString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

/** Render one element of a section value as a single readable line. */
function elementToString(value: unknown): string | undefined {
  const scalar = scalarToString(value);
  if (scalar !== undefined) {
    return scalar;
  }
  if (isPlainObject(value)) {
    const parts: string[] = [];
    for (const [key, raw] of Object.entries(value)) {
      const text = scalarToString(raw);
      if (text !== undefined) {
        parts.push(`${key}: ${text}`);
      }
    }
    return parts.length > 0 ? parts.join('; ') : undefined;
  }
  return undefined;
}

/** Flatten a section value (string, array, or object) into readable items. */
function valueToItems(value: unknown): string[] {
  if (Array.isArray(value)) {
    const items: string[] = [];
    for (const element of value) {
      const text = elementToString(element);
      if (text !== undefined) {
        items.push(text);
      }
    }
    return items;
  }
  if (isPlainObject(value)) {
    const items: string[] = [];
    for (const [key, raw] of Object.entries(value)) {
      const text = elementToString(raw);
      if (text !== undefined) {
        items.push(`${key}: ${text}`);
      }
    }
    return items;
  }
  const scalar = scalarToString(value);
  return scalar !== undefined ? [scalar] : [];
}

/** Summarize an already-parsed Codex artifact object into ordered sections. */
export function summarizeCodexArtifactValue(value: unknown): CodexArtifactSection[] {
  if (!isPlainObject(value)) {
    return [];
  }
  const sections: CodexArtifactSection[] = [];
  for (const spec of SECTION_SPECS) {
    const key = spec.keys.find((k) => k in value);
    if (key === undefined) {
      continue;
    }
    const items = valueToItems(value[key]);
    if (items.length > 0) {
      sections.push({ label: spec.label, items });
    }
  }
  return sections;
}

/**
 * Read and summarize a Codex JSON artifact at `path`. Returns [] on any read or
 * parse failure (tolerant: a malformed artifact yields no summary, never a throw).
 */
export function summarizeCodexArtifact(path: string): CodexArtifactSection[] {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  return summarizeCodexArtifactValue(parsed);
}
