import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import type { PersonasRepo, SyncedAgent } from '@/persistence/personas-repo';

/**
 * Persona catalog sync (Code Map: `syncPersonas(repo)`). Reads
 * `_bmad/config.toml` and deep-merges `_bmad/custom/config.toml` over it
 * (team/enterprise overrides — "Tables deep-merge over base config; keyed
 * entries merge by key", per `_bmad/custom/config.toml`'s own header
 * comment), extracts the `[agents.*]` tables, and upserts them into the
 * `personas` table. Any previously-known `agentSkillId` absent from this
 * sync is marked `removed` (never deleted, never re-matched by name).
 *
 * Never hand-parses TOML with regex — uses `smol-toml`, a real parser.
 */

type TomlTable = Record<string, unknown>;

function isPlainObject(value: unknown): value is TomlTable {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Recursively merges `override` onto `base`, keyed by object key. */
function deepMerge(base: TomlTable, override: TomlTable): TomlTable {
  const merged: TomlTable = { ...base };
  for (const [key, overrideValue] of Object.entries(override)) {
    const baseValue = merged[key];
    if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      merged[key] = deepMerge(baseValue, overrideValue);
    } else {
      merged[key] = overrideValue;
    }
  }
  return merged;
}

type ReadTomlResult = { ok: true; value: TomlTable } | { ok: false };

/**
 * Reads and parses a TOML file. `missingIsEmpty` controls whether an
 * `ENOENT` (file doesn't exist) is treated as "legitimately empty" — true
 * for the optional `_bmad/custom/config.toml` overrides file, false for the
 * base `_bmad/config.toml`, which should basically always exist. Any other
 * read error, or a parse failure, is always reported as `{ ok: false }`
 * rather than silently swallowed — callers decide how to react.
 */
function readToml(filePath: string, missingIsEmpty: boolean): ReadTomlResult {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (err) {
    if (missingIsEmpty && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ok: true, value: {} };
    }
    return { ok: false };
  }
  try {
    return { ok: true, value: parse(raw) as TomlTable };
  } catch {
    return { ok: false };
  }
}

function extractAgents(config: TomlTable): SyncedAgent[] {
  const agentsTable = config.agents;
  if (!isPlainObject(agentsTable)) return [];

  const agents: SyncedAgent[] = [];
  for (const [agentSkillId, value] of Object.entries(agentsTable)) {
    if (!isPlainObject(value)) continue;
    agents.push({
      agentSkillId,
      name: typeof value.name === 'string' ? value.name : '',
      title: typeof value.title === 'string' ? value.title : '',
      icon: typeof value.icon === 'string' ? value.icon : '',
      description: typeof value.description === 'string' ? value.description : '',
      module: typeof value.module === 'string' ? value.module : '',
    });
  }
  return agents;
}

export function syncPersonas(repo: PersonasRepo, bmadDir = path.join(process.cwd(), '_bmad')): void {
  const base = readToml(path.join(bmadDir, 'config.toml'), false);
  if (!base.ok) {
    // Base config unreadable or unparseable: leave the existing catalog
    // exactly as it was rather than wiping every persona to `removed`.
    console.warn(`syncPersonas: failed to read/parse ${path.join(bmadDir, 'config.toml')}; skipping sync`);
    return;
  }
  const customPath = path.join(bmadDir, 'custom', 'config.toml');
  const custom = readToml(customPath, true);
  if (!custom.ok) {
    // A missing custom/config.toml is absorbed into `ok: true` above (it's
    // optional) — reaching here means it exists but failed to read/parse.
    console.warn(`syncPersonas: failed to read/parse ${customPath}; ignoring overrides`);
  }
  const customValue = custom.ok ? custom.value : {};

  const merged = deepMerge(base.value, customValue);
  const agents = extractAgents(merged);

  try {
    repo.upsertMany(agents);
    repo.markRemoved(agents.map((agent) => agent.agentSkillId));
  } catch (err) {
    // A DB write failure (locked file, disk full) here must not crash app
    // boot — log and leave the catalog in whatever state the last
    // successful sync left it, same posture as a config read/parse failure.
    console.warn('syncPersonas: failed to write persona catalog', err);
  }
}
