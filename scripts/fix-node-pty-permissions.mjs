// node-pty@1.1.0 ships its macOS `spawn-helper` prebuilds without the
// execute bit (0644 instead of 0755) — a known packaging bug
// (microsoft/node-pty#850). Without this, every pty spawn on macOS fails
// synchronously with "posix_spawnp failed", regardless of the target
// command. Restoring the bit after every install is the documented
// workaround until a fixed node-pty release is adopted.
import { chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const spawnHelpers = [
  'node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper',
  'node_modules/node-pty/prebuilds/darwin-x64/spawn-helper',
];

for (const relativePath of spawnHelpers) {
  const path = join(process.cwd(), relativePath);
  if (!existsSync(path)) continue;
  try {
    chmodSync(path, 0o755);
  } catch {
    // Not fatal — a subsequent real pty spawn will surface the same
    // "posix_spawnp failed" error with a clearer trail to this script.
  }
}
