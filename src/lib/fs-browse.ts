import type { Dirent, Stats } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * `GET /api/fs/browse` — backend-resolved directory listing only (AD-7).
 * Unrestricted (no path is off-limits — single-user local tool), but opens
 * at the user's home directory by default; the user can navigate to any
 * volume/drive from there.
 */

export class BrowseError extends Error {}

export interface BrowseEntry {
  name: string;
  path: string;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
}

export async function browseDirectory(requestedPath?: string | null): Promise<BrowseResult> {
  const trimmed = requestedPath?.trim();
  const target = trimmed && trimmed.length > 0 ? trimmed : os.homedir();
  const resolved = path.resolve(target);

  let stat: Stats;
  try {
    stat = await fs.stat(resolved);
  } catch {
    throw new BrowseError(`Path does not exist: ${resolved}`);
  }

  if (!stat.isDirectory()) {
    throw new BrowseError(`Not a directory: ${resolved}`);
  }

  let dirents: Dirent[];
  try {
    dirents = await fs.readdir(resolved, { withFileTypes: true });
  } catch {
    throw new BrowseError(`Cannot read directory: ${resolved}`);
  }

  const candidates = await Promise.all(
    dirents.map(async (entry) => {
      const entryPath = path.join(resolved, entry.name);
      if (entry.isDirectory()) {
        return { name: entry.name, path: entryPath, isDir: true };
      }
      if (entry.isSymbolicLink()) {
        // Dirent.isDirectory() doesn't follow symlinks — stat the target so
        // symlinked project directories still show up in the browser.
        try {
          const targetStat = await fs.stat(entryPath);
          return { name: entry.name, path: entryPath, isDir: targetStat.isDirectory() };
        } catch {
          return { name: entry.name, path: entryPath, isDir: false };
        }
      }
      return { name: entry.name, path: entryPath, isDir: false };
    }),
  );

  const entries: BrowseEntry[] = candidates
    .filter((entry) => entry.isDir)
    .map(({ name, path: entryPath }) => ({ name, path: entryPath }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const parentDir = path.dirname(resolved);
  const parent = parentDir === resolved ? null : parentDir;

  return { path: resolved, parent, entries };
}
