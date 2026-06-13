/**
 * State-home resolution, mirroring quaat/autonomous-development exactly
 * (docs/REFERENCE.md §1). Pure: all environment inputs are injectable so the
 * platform matrix can be unit-tested without touching the real OS.
 */

import { homedir as osHomedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

export interface StateHomeOptions {
  /** Explicit override (extension setting `autonomousDev.stateHome`). Highest precedence. */
  readonly settingOverride?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly homedir?: string;
}

const APP_DIR = 'claude-autonomous';

/** Expand a leading `~` (or `~/`) to the home directory. */
export function expandUser(input: string, home: string): string {
  if (input === '~') {
    return home;
  }
  if (input.startsWith('~/') || input.startsWith('~\\')) {
    return join(home, input.slice(2));
  }
  return input;
}

function platformDefault(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): string {
  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', APP_DIR);
  }
  if (platform === 'win32') {
    const localAppData = env['LOCALAPPDATA'];
    if (localAppData && localAppData.length > 0) {
      return join(localAppData, APP_DIR);
    }
    return join(home, 'AppData', 'Local', APP_DIR);
  }
  // Linux / other.
  const xdg = env['XDG_STATE_HOME'];
  if (xdg && xdg.length > 0) {
    return join(xdg, APP_DIR);
  }
  return join(home, '.local', 'state', APP_DIR);
}

/**
 * Resolve the autonomous-development state home using reference precedence:
 *   1. explicit setting override
 *   2. CLAUDE_AUTONOMOUS_STATE_HOME
 *   3. platform default
 * The result is `expanduser`-ed and absolutized.
 */
export function resolveStateHome(options: StateHomeOptions = {}): string {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.homedir ?? osHomedir();

  // User-supplied paths may be relative or contain `~`, so they are expanded and
  // absolutized against home. Platform defaults are already absolute (and use the
  // host's path separators), so they are returned verbatim.
  const absolutize = (input: string): string => {
    const expanded = expandUser(input, home);
    return isAbsolute(expanded) ? resolve(expanded) : resolve(home, expanded);
  };

  const override = options.settingOverride;
  if (override && override.trim().length > 0) {
    return absolutize(override.trim());
  }
  const fromEnv = env['CLAUDE_AUTONOMOUS_STATE_HOME'];
  if (fromEnv && fromEnv.trim().length > 0) {
    return absolutize(fromEnv.trim());
  }
  return platformDefault(platform, env, home);
}

/**
 * Relative path of a legacy in-repo layout's run-state, for read-only detection.
 * docs/REFERENCE.md §2: `<repo>/.ai/autonomous-development/run-state.json`.
 */
export const LEGACY_LAYOUT_RELATIVE = join('.ai', 'autonomous-development', 'run-state.json');
