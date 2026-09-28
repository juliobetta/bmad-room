import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Project activation (AD-2 / Epic 1 Context Technical Decisions): the only
 * module that establishes a project's pty cwd. Run before any pty spawns
 * for a project's thread. Four responsibilities, in order:
 *
 *   1. Re-verify the project's checkout is still real (it may have been
 *      moved/deleted since `Project.path` was written) — never trust the
 *      stored path blindly.
 *   2. Ensure the `_bmad` symlink overlay exists at `<projectPath>/_bmad`,
 *      pointing at this app's own `_bmad` install, so a `claude` CLI
 *      spawned in that cwd can resolve `{project-root}/_bmad/...` paths
 *      the same way it does inside this repo.
 *   3. Register `_bmad` in that project's `.git/info/exclude` — never a
 *      committed `.gitignore` — so the overlay never shows up as an
 *      untracked file in the user's real project.
 *   4. Pre-accept the CLI's one-time workspace-trust dialog for this path
 *      in `~/.claude.json` — `node-pty` gives the spawned `claude` a real
 *      TTY (the dialog's own non-interactive-mode skip, `-p`/piped stdout,
 *      doesn't apply), so a brand-new project would otherwise hang forever
 *      waiting for a keypress nothing ever sends.
 *
 * Returns a discriminated result mirroring `src/lib/projects.ts`'s
 * `CheckoutValidation` shape. On `{ok:false}`, the caller (`ThreadActor`)
 * must never spawn a pty.
 */

export type ActivateProjectResult = { ok: true; cwd: string } | { ok: false; reason: string };

async function isDirectory(candidate: string): Promise<boolean> {
  try {
    const stat = await fs.stat(candidate);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/** A real checkout's `.git` entry is a directory (regular clone) or a file (worktree/submodule, `gitdir: <path>`). */
async function gitEntryExists(candidate: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(candidate);
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Resolves the directory that `info/exclude` lives in for this checkout's
 * `.git` entry. A plain clone's is `.git/info`. A worktree/submodule's
 * `.git` is a file containing `gitdir: <path>`: a submodule's resolved
 * gitdir has its own `info/exclude` directly; a worktree's gitdir instead
 * has a `commondir` file pointing back at the shared main `.git` directory
 * where excludes actually live (worktrees don't get their own).
 */
async function resolveGitInfoDir(projectPath: string): Promise<string | null> {
  const gitPath = path.join(projectPath, '.git');
  let stat: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    stat = await fs.lstat(gitPath);
  } catch {
    return null;
  }

  if (stat.isDirectory()) {
    return path.join(gitPath, 'info');
  }
  if (!stat.isFile()) return null;

  let content: string;
  try {
    content = await fs.readFile(gitPath, 'utf-8');
  } catch {
    return null;
  }
  const match = content.match(/^gitdir:\s*(.+)$/m);
  if (!match?.[1]) return null;
  const gitDirPath = path.resolve(projectPath, match[1].trim());

  try {
    const commonDirRaw = await fs.readFile(path.join(gitDirPath, 'commondir'), 'utf-8');
    return path.join(path.resolve(gitDirPath, commonDirRaw.trim()), 'info');
  } catch {
    return path.join(gitDirPath, 'info'); // no commondir — a submodule's own gitdir
  }
}

async function ensureBmadOverlay(projectPath: string, bmadRoomRoot: string): Promise<ActivateProjectResult | null> {
  const overlayPath = path.join(projectPath, '_bmad');
  const sourcePath = path.join(bmadRoomRoot, '_bmad');

  let existingLink: string | undefined;
  try {
    existingLink = await fs.readlink(overlayPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT' && (err as NodeJS.ErrnoException).code !== 'EINVAL') {
      return { ok: false, reason: `Failed to inspect _bmad overlay at ${overlayPath}` };
    }
  }

  if (existingLink !== undefined) {
    // Already a symlink — fine as long as it resolves to our source.
    const resolvedExisting = path.resolve(path.dirname(overlayPath), existingLink);
    if (resolvedExisting !== sourcePath) {
      return { ok: false, reason: `_bmad at ${overlayPath} is a symlink to an unexpected location` };
    }
    return null;
  }

  // Not a symlink: either absent (create it) or an unexpected real entry.
  try {
    const stat = await fs.lstat(overlayPath);
    if (stat.isDirectory() || stat.isFile()) {
      return { ok: false, reason: `_bmad at ${overlayPath} already exists and is not the expected overlay symlink` };
    }
  } catch {
    // ENOENT — expected, fall through to create the symlink.
  }

  try {
    await fs.symlink(sourcePath, overlayPath, 'dir');
  } catch (err) {
    return { ok: false, reason: `Failed to create _bmad overlay symlink: ${(err as Error).message}` };
  }
  return null;
}

async function ensureGitExclude(projectPath: string): Promise<ActivateProjectResult | null> {
  const infoDir = await resolveGitInfoDir(projectPath);
  if (!infoDir) {
    return { ok: false, reason: `Could not resolve a .git info directory for ${projectPath}` };
  }
  const excludePath = path.join(infoDir, 'exclude');

  try {
    await fs.mkdir(infoDir, { recursive: true });
  } catch (err) {
    return { ok: false, reason: `Failed to create .git/info: ${(err as Error).message}` };
  }

  let existing = '';
  try {
    existing = await fs.readFile(excludePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      return { ok: false, reason: `Failed to read .git/info/exclude: ${(err as Error).message}` };
    }
  }

  const lines = existing.split('\n');
  const alreadyExcluded = lines.some((line) => line.trim() === '_bmad');
  if (alreadyExcluded) return null;

  const needsLeadingNewline = existing.length > 0 && !existing.endsWith('\n');
  const addition = `${needsLeadingNewline ? '\n' : ''}_bmad\n`;
  try {
    await fs.appendFile(excludePath, addition, 'utf-8');
  } catch (err) {
    return { ok: false, reason: `Failed to write .git/info/exclude: ${(err as Error).message}` };
  }
  return null;
}

/**
 * Marks `projectPath` as trust-accepted in the CLI's own per-project config
 * (`~/.claude.json`'s `projects[path].hasTrustDialogAccepted`) — the same
 * flag an interactive "Do you trust this folder?" acceptance would set.
 * Read-modify-write of the whole file: only that one field is ever added
 * or changed, every other key (auth, other projects' entries, etc.) passes
 * through untouched. Fails closed — an unreadable/malformed config is
 * reported rather than risking silently clobbering the user's real config.
 */
async function ensureWorkspaceTrusted(
  projectPath: string,
  claudeConfigPath: string,
): Promise<ActivateProjectResult | null> {
  let raw: string;
  try {
    raw = await fs.readFile(claudeConfigPath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      return { ok: false, reason: `Failed to read ${claudeConfigPath}: ${(err as Error).message}` };
    }
    raw = '{}'; // no config yet — first-ever `claude` launch on this machine.
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    return { ok: false, reason: `${claudeConfigPath} is not valid JSON: ${(err as Error).message}` };
  }

  const projects =
    config.projects && typeof config.projects === 'object'
      ? (config.projects as Record<string, Record<string, unknown> | undefined>)
      : {};
  const existingEntry = projects[projectPath];
  if (existingEntry?.hasTrustDialogAccepted === true) return null; // already trusted.

  config.projects = { ...projects, [projectPath]: { ...existingEntry, hasTrustDialogAccepted: true } };

  try {
    await fs.writeFile(claudeConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
  } catch (err) {
    return { ok: false, reason: `Failed to write ${claudeConfigPath}: ${(err as Error).message}` };
  }
  return null;
}

export async function activateProject(
  projectPath: string,
  bmadRoomRoot: string = process.cwd(),
  claudeConfigPath: string = path.join(os.homedir(), '.claude.json'),
): Promise<ActivateProjectResult> {
  const gitDir = path.join(projectPath, '.git');
  if (!(await isDirectory(projectPath))) {
    return { ok: false, reason: `Project path no longer exists or is not a directory: ${projectPath}` };
  }
  if (!(await gitEntryExists(gitDir))) {
    return { ok: false, reason: `Not a real project checkout (no .git directory): ${projectPath}` };
  }

  const overlayResult = await ensureBmadOverlay(projectPath, bmadRoomRoot);
  if (overlayResult) return overlayResult;

  const excludeResult = await ensureGitExclude(projectPath);
  if (excludeResult) return excludeResult;

  const trustResult = await ensureWorkspaceTrusted(projectPath, claudeConfigPath);
  if (trustResult) return trustResult;

  return { ok: true, cwd: projectPath };
}
