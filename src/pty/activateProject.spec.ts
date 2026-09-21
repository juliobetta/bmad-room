import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { activateProject } from './activateProject';

describe('activateProject', () => {
  let tmpRoot: string;
  let bmadRoomRoot: string;
  let projectPath: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'activate-project-'));
    bmadRoomRoot = path.join(tmpRoot, 'bmad-room');
    projectPath = path.join(tmpRoot, 'target-project');
    await fs.mkdir(path.join(bmadRoomRoot, '_bmad'), { recursive: true });
    await fs.mkdir(path.join(projectPath, '.git'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  test('fails when the project path does not exist', async () => {
    const result = await activateProject(path.join(tmpRoot, 'nope'), bmadRoomRoot);
    expect(result.ok).toBe(false);
  });

  test('fails when there is no .git directory', async () => {
    const noGitPath = path.join(tmpRoot, 'no-git-project');
    await fs.mkdir(noGitPath, { recursive: true });
    const result = await activateProject(noGitPath, bmadRoomRoot);
    expect(result.ok).toBe(false);
  });

  test('creates the _bmad symlink overlay pointing at the bmad-room install', async () => {
    const result = await activateProject(projectPath, bmadRoomRoot);
    expect(result).toEqual({ ok: true, cwd: projectPath });

    const overlayPath = path.join(projectPath, '_bmad');
    const stat = await fs.lstat(overlayPath);
    expect(stat.isSymbolicLink()).toBe(true);
    const target = await fs.readlink(overlayPath);
    expect(path.resolve(projectPath, target)).toBe(path.join(bmadRoomRoot, '_bmad'));
  });

  test('registers _bmad in .git/info/exclude, never touching .gitignore', async () => {
    await activateProject(projectPath, bmadRoomRoot);

    const exclude = await fs.readFile(path.join(projectPath, '.git', 'info', 'exclude'), 'utf-8');
    expect(exclude).toContain('_bmad');

    const gitignoreExists = await fs
      .access(path.join(projectPath, '.gitignore'))
      .then(() => true)
      .catch(() => false);
    expect(gitignoreExists).toBe(false);
  });

  test('is idempotent: a second activation does not duplicate the exclude entry or fail', async () => {
    const first = await activateProject(projectPath, bmadRoomRoot);
    const second = await activateProject(projectPath, bmadRoomRoot);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const exclude = await fs.readFile(path.join(projectPath, '.git', 'info', 'exclude'), 'utf-8');
    const occurrences = exclude.split('\n').filter((line) => line.trim() === '_bmad').length;
    expect(occurrences).toBe(1);
  });

  test('preserves existing .git/info/exclude content and appends _bmad', async () => {
    const infoDir = path.join(projectPath, '.git', 'info');
    await fs.mkdir(infoDir, { recursive: true });
    await fs.writeFile(path.join(infoDir, 'exclude'), '*.log\n', 'utf-8');

    await activateProject(projectPath, bmadRoomRoot);

    const exclude = await fs.readFile(path.join(infoDir, 'exclude'), 'utf-8');
    expect(exclude).toContain('*.log');
    expect(exclude).toContain('_bmad');
  });

  test('fails when a real (non-symlink) _bmad directory already exists in the project', async () => {
    await fs.mkdir(path.join(projectPath, '_bmad'), { recursive: true });
    const result = await activateProject(projectPath, bmadRoomRoot);
    expect(result.ok).toBe(false);
  });

  test('succeeds for a git worktree checkout (.git is a file, exclude goes to the shared common dir)', async () => {
    // Simulate `git worktree add`: a `.git` file pointing at a gitdir under
    // the main repo's `.git/worktrees/<name>`, itself carrying a
    // `commondir` file pointing back at the main `.git` directory.
    const mainGitDir = path.join(tmpRoot, 'main-repo', '.git');
    const worktreeGitDir = path.join(mainGitDir, 'worktrees', 'target-project');
    await fs.mkdir(worktreeGitDir, { recursive: true });
    await fs.writeFile(path.join(worktreeGitDir, 'commondir'), '../..\n', 'utf-8');
    await fs.rm(path.join(projectPath, '.git'), { recursive: true, force: true });
    await fs.writeFile(path.join(projectPath, '.git'), `gitdir: ${worktreeGitDir}\n`, 'utf-8');

    const result = await activateProject(projectPath, bmadRoomRoot);
    expect(result).toEqual({ ok: true, cwd: projectPath });

    const exclude = await fs.readFile(path.join(mainGitDir, 'info', 'exclude'), 'utf-8');
    expect(exclude).toContain('_bmad');
  });
});
