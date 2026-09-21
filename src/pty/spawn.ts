import * as pty from 'node-pty';

/**
 * node-pty spawn wrapper (Code Map: "only `ThreadActor` calls this, never a
 * route or component"). Spawns plain `claude` (no flags) per the frozen
 * "Persona invocation (decided)" section — flags/model selection are not
 * this story's concern.
 */

export interface SpawnClaudeOptions {
  cwd: string;
  cols?: number;
  rows?: number;
}

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 40;

/** `process.env` values are typed `string | undefined` — drop the undefined ones rather than casting past them. */
function definedEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

export function spawnClaude({ cwd, cols = DEFAULT_COLS, rows = DEFAULT_ROWS }: SpawnClaudeOptions): pty.IPty {
  return pty.spawn('claude', [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: definedEnv(),
  });
}
