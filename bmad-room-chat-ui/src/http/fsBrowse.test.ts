import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { browseDirectory, BrowseError } from './fsBrowse.js';

async function makeTempTree(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-room-fsbrowse-'));
  await fs.mkdir(path.join(root, 'project-a'));
  await fs.mkdir(path.join(root, 'project-b'));
  await fs.mkdir(path.join(root, '.hidden'));
  await fs.writeFile(path.join(root, 'a-file.txt'), 'not a directory');
  return root;
}

test('browseDirectory() lists only child directories, resolved to absolute paths', async () => {
  const root = await makeTempTree();
  const result = await browseDirectory(root);

  assert.equal(result.path, root);
  assert.equal(result.parent, path.dirname(root));
  assert.deepEqual(
    result.entries.map((e) => e.name),
    ['.hidden', 'project-a', 'project-b'],
  );
  for (const entry of result.entries) {
    assert.ok(path.isAbsolute(entry.path));
    assert.equal(entry.path, path.join(root, entry.name));
  }
});

test('browseDirectory() defaults to the home directory when no path is given', async () => {
  const result = await browseDirectory(undefined);
  assert.equal(result.path, os.homedir());
});

test('browseDirectory() rejects a nonexistent path', async () => {
  await assert.rejects(
    () => browseDirectory('/definitely/does/not/exist/on/this/machine'),
    BrowseError,
  );
});

test('browseDirectory() rejects a path that is not a directory', async () => {
  const root = await makeTempTree();
  await assert.rejects(() => browseDirectory(path.join(root, 'a-file.txt')), BrowseError);
});

test('browseDirectory() includes a symlink that points at a directory', async () => {
  const root = await makeTempTree();
  const linkTarget = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-room-fsbrowse-target-'));
  await fs.symlink(linkTarget, path.join(root, 'linked-project'), 'dir');

  const result = await browseDirectory(root);
  assert.ok(result.entries.some((e) => e.name === 'linked-project'));
});

test('browseDirectory() trims whitespace from the requested path', async () => {
  const root = await makeTempTree();
  const result = await browseDirectory(`  ${root}  `);
  assert.equal(result.path, root);
});
