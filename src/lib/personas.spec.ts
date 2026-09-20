import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { PersonasRepo } from '@/persistence/personas-repo';
import { initSchema } from '@/persistence/schema';
import { syncPersonas } from './personas';

const BASE_CONFIG = `
[agents.bmad-agent-analyst]
module = "bmm"
name = "Mary"
title = "Business Analyst"
icon = "📊"
description = "Grounds every finding in verifiable evidence."

[agents.bmad-agent-pm]
module = "bmm"
name = "John"
title = "Product Manager"
icon = "📋"
description = "Drives PRD creation."
`;

let tmpDir: string | undefined;

function makeBmadDir(base: string, custom?: string): string {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'bmad-personas-spec-'));
  writeFileSync(path.join(tmpDir, 'config.toml'), base);
  if (custom !== undefined) {
    mkdirSync(path.join(tmpDir, 'custom'));
    writeFileSync(path.join(tmpDir, 'custom', 'config.toml'), custom);
  }
  return tmpDir;
}

function makeRepo(): PersonasRepo {
  const db = new Database(':memory:');
  initSchema(db);
  return new PersonasRepo(db);
}

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

describe('syncPersonas', () => {
  test('upserts every [agents.*] table from config.toml', () => {
    const repo = makeRepo();
    const bmadDir = makeBmadDir(BASE_CONFIG);

    syncPersonas(repo, bmadDir);

    const listed = repo.list();
    expect(listed.length).toBe(2);
    const analyst = repo.findById('bmad-agent-analyst');
    expect(analyst).toMatchObject({
      agentSkillId: 'bmad-agent-analyst',
      name: 'Mary',
      title: 'Business Analyst',
      icon: '📊',
      module: 'bmm',
      status: 'active',
    });
  });

  test('deep-merges _bmad/custom/config.toml overrides, keyed by TOML key', () => {
    const repo = makeRepo();
    const customConfig = `
[agents.bmad-agent-pm]
description = "Prefers short, bulleted PRDs over narrative drafts."
`;
    const bmadDir = makeBmadDir(BASE_CONFIG, customConfig);

    syncPersonas(repo, bmadDir);

    const pm = repo.findById('bmad-agent-pm');
    expect(pm?.description).toBe('Prefers short, bulleted PRDs over narrative drafts.');
    // Fields not overridden survive the merge.
    expect(pm?.name).toBe('John');

    const analyst = repo.findById('bmad-agent-analyst');
    expect(analyst?.description).toBe('Grounds every finding in verifiable evidence.');
  });

  test('adds a brand-new [agents.*] table from custom/config.toml', () => {
    const repo = makeRepo();
    const customConfig = `
[agents.bmad-custom-agent]
module = "custom"
name = "Custom"
title = "Custom Agent"
icon = "🛠️"
description = "Added via team override."
`;
    const bmadDir = makeBmadDir(BASE_CONFIG, customConfig);

    syncPersonas(repo, bmadDir);

    expect(repo.list().length).toBe(3);
    expect(repo.findById('bmad-custom-agent')).toMatchObject({ name: 'Custom', status: 'active' });
  });

  test('marks an agentSkillId absent from a re-sync as removed, keeping the row', () => {
    const repo = makeRepo();
    const bmadDir = makeBmadDir(BASE_CONFIG);
    syncPersonas(repo, bmadDir);

    // Re-sync against a config where the PM agent has disappeared.
    const shrunkConfig = `
[agents.bmad-agent-analyst]
module = "bmm"
name = "Mary"
title = "Business Analyst"
icon = "📊"
description = "Grounds every finding in verifiable evidence."
`;
    writeFileSync(path.join(bmadDir, 'config.toml'), shrunkConfig);
    syncPersonas(repo, bmadDir);

    expect(repo.findById('bmad-agent-analyst')?.status).toBe('active');
    expect(repo.findById('bmad-agent-pm')?.status).toBe('removed');
    expect(repo.list().length).toBe(2);
  });

  test('handles a missing _bmad/custom/config.toml gracefully', () => {
    const repo = makeRepo();
    const bmadDir = makeBmadDir(BASE_CONFIG);

    expect(() => syncPersonas(repo, bmadDir)).not.toThrow();
    expect(repo.list().length).toBe(2);
  });

  test('a missing base config.toml leaves the existing catalog untouched instead of removing everything', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const repo = makeRepo();
    const bmadDir = makeBmadDir(BASE_CONFIG);
    syncPersonas(repo, bmadDir);
    expect(repo.findById('bmad-agent-analyst')?.status).toBe('active');
    expect(repo.findById('bmad-agent-pm')?.status).toBe('active');

    // Base config.toml disappears entirely (not merely empty/missing custom).
    rmSync(path.join(bmadDir, 'config.toml'));

    expect(() => syncPersonas(repo, bmadDir)).not.toThrow();
    expect(repo.findById('bmad-agent-analyst')?.status).toBe('active');
    expect(repo.findById('bmad-agent-pm')?.status).toBe('active');
    expect(repo.list().length).toBe(2);
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  test('an unparseable base config.toml leaves the existing catalog untouched instead of removing everything', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const repo = makeRepo();
    const bmadDir = makeBmadDir(BASE_CONFIG);
    syncPersonas(repo, bmadDir);
    expect(repo.findById('bmad-agent-analyst')?.status).toBe('active');
    expect(repo.findById('bmad-agent-pm')?.status).toBe('active');

    // Base config.toml becomes malformed TOML.
    writeFileSync(path.join(bmadDir, 'config.toml'), '[agents.broken\nname = "oops"');

    expect(() => syncPersonas(repo, bmadDir)).not.toThrow();
    expect(repo.findById('bmad-agent-analyst')?.status).toBe('active');
    expect(repo.findById('bmad-agent-pm')?.status).toBe('active');
    expect(repo.list().length).toBe(2);
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});
