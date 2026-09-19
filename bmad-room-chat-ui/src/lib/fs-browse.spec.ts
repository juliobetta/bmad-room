import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { BrowseError, browseDirectory } from './fs-browse';

async function makeTempTree(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-room-fsbrowse-'));
  await fs.mkdir(path.join(root, 'project-a'));
  await fs.mkdir(path.join(root, 'project-b'));
  await fs.mkdir(path.join(root, '.hidden'));
  await fs.writeFile(path.join(root, 'a-file.txt'), 'not a directory');
  return root;
}

describe('browseDirectory()', () => {
  test('lists only child directories, resolved to absolute paths', async () => {
    const root = await makeTempTree();
    const result = await browseDirectory(root);

    expect(result.path).toBe(root);
    expect(result.parent).toBe(path.dirname(root));
    expect(result.entries.map((e) => e.name)).toEqual(['.hidden', 'project-a', 'project-b']);
    for (const entry of result.entries) {
      expect(path.isAbsolute(entry.path)).toBe(true);
      expect(entry.path).toBe(path.join(root, entry.name));
    }
  });

  test('defaults to the home directory when no path is given', async () => {
    const result = await browseDirectory(undefined);
    expect(result.path).toBe(os.homedir());
  });

  test('rejects a nonexistent path', async () => {
    await expect(browseDirectory('/definitely/does/not/exist/on/this/machine')).rejects.toBeInstanceOf(BrowseError);
  });

  test('rejects a path that is not a directory', async () => {
    const root = await makeTempTree();
    await expect(browseDirectory(path.join(root, 'a-file.txt'))).rejects.toBeInstanceOf(BrowseError);
  });

  test('includes a symlink that points at a directory', async () => {
    const root = await makeTempTree();
    const linkTarget = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-room-fsbrowse-target-'));
    await fs.symlink(linkTarget, path.join(root, 'linked-project'), 'dir');

    const result = await browseDirectory(root);
    expect(result.entries.some((e) => e.name === 'linked-project')).toBe(true);
  });

  test('trims whitespace from the requested path', async () => {
    const root = await makeTempTree();
    const result = await browseDirectory(`  ${root}  `);
    expect(result.path).toBe(root);
  });
});
