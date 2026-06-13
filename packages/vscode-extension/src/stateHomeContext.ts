import { resolveStateHome } from '@semanticmatter/core';

import type { ExtensionConfig } from './config';

/**
 * Resolve the active state home from extension configuration using the
 * reference precedence (setting override > CLAUDE_AUTONOMOUS_STATE_HOME >
 * platform default). An empty setting means "no override", not "empty path".
 */
export function resolveActiveStateHome(config: ExtensionConfig): string {
  return resolveStateHome(config.stateHome.length > 0 ? { settingOverride: config.stateHome } : {});
}
