/**
 * Pure construction of controller.py argv arrays (docs/REFERENCE.md §10).
 *
 * NEVER build a shell string — the extension spawns via execFile with these
 * arrays. Run-scoped commands REQUIRE an explicit run id; we never rely on the
 * controller's "single active run" fallback.
 */

export type ControllerSubcommand =
  | 'doctor'
  | 'init'
  | 'list-runs'
  | 'show-run'
  | 'status'
  | 'evaluate'
  | 'accept-drift'
  | 'cancel'
  | 'archive-run';

/** Workflow rigor modes accepted by `controller.py init --mode`. */
export type ControllerInitMode = 'auto' | 'lean' | 'standard' | 'rigorous';

const MUTATING: ReadonlySet<ControllerSubcommand> = new Set([
  'init',
  'evaluate',
  'accept-drift',
  'cancel',
  'archive-run'
]);

/** Commands that must be scoped to an explicit --run-id. */
const RUN_SCOPED: ReadonlySet<ControllerSubcommand> = new Set([
  'show-run',
  'status',
  'evaluate',
  'accept-drift',
  'cancel',
  'archive-run'
]);

export function isMutatingSubcommand(sub: ControllerSubcommand): boolean {
  return MUTATING.has(sub);
}

export interface ControllerContext {
  /** Python executable (e.g. "python3"); becomes the spawned program. */
  readonly pythonPath: string;
  /** Absolute path to scripts/controller.py. */
  readonly controllerPath: string;
  /** Absolute project root (always passed as --project-root). */
  readonly projectRoot: string;
  /** Optional explicit state home (--state-dir). */
  readonly stateHome?: string;
}

export interface ControllerOptions {
  /** Required for run-scoped subcommands; ignored otherwise. */
  readonly runId?: string;
  /** list-runs: include archived/terminal runs (--all). */
  readonly all?: boolean;
  /** cancel: optional reason. */
  readonly reason?: string;
  /** Append --json (list-runs/show-run/status). */
  readonly json?: boolean;
  /** init: required feature description (--feature). */
  readonly feature?: string;
  /** init: workflow rigor mode (--mode). */
  readonly mode?: ControllerInitMode;
  /** init: human-readable label stored in state (--label). */
  readonly label?: string;
  /** init: review-round budget 1–5 (--max-review-rounds). */
  readonly maxReviewRounds?: number;
}

export interface ControllerCommandLine {
  /** Program to spawn (the Python executable). */
  readonly command: string;
  /** Argument array (controller.py first). */
  readonly args: readonly string[];
  readonly mutating: boolean;
}

/**
 * Build an execFile-ready command line for a controller subcommand.
 * @throws if a run-scoped subcommand is requested without a runId.
 */
export function buildControllerCommand(
  ctx: ControllerContext,
  sub: ControllerSubcommand,
  options: ControllerOptions = {}
): ControllerCommandLine {
  if (RUN_SCOPED.has(sub) && (!options.runId || options.runId.length === 0)) {
    throw new Error(`Controller subcommand "${sub}" requires an explicit runId`);
  }
  if (sub === 'init' && (!options.feature || options.feature.length === 0)) {
    throw new Error('Controller subcommand "init" requires a feature description');
  }

  // --run-id is a GLOBAL option (before the subcommand). Passing it globally
  // works for every run-scoped command; we never add a subcommand-level
  // duplicate that an older controller might reject.
  const args: string[] = [ctx.controllerPath, '--project-root', ctx.projectRoot];
  if (ctx.stateHome && ctx.stateHome.length > 0) {
    args.push('--state-dir', ctx.stateHome);
  }
  if (RUN_SCOPED.has(sub) && options.runId) {
    args.push('--run-id', options.runId);
  }

  args.push(sub);

  switch (sub) {
    case 'init':
      // `feature` is guaranteed non-empty by the guard above.
      args.push('--feature', options.feature as string);
      if (options.label && options.label.length > 0) args.push('--label', options.label);
      if (options.mode) args.push('--mode', options.mode);
      if (options.maxReviewRounds !== undefined) {
        args.push('--max-review-rounds', String(options.maxReviewRounds));
      }
      break;
    case 'list-runs':
      if (options.json !== false) args.push('--json');
      if (options.all) args.push('--all');
      break;
    case 'show-run':
    case 'status':
      if (options.json !== false) args.push('--json');
      break;
    case 'cancel':
      if (options.reason && options.reason.length > 0) args.push('--reason', options.reason);
      break;
    default:
      break;
  }

  return { command: ctx.pythonPath, args, mutating: MUTATING.has(sub) };
}
