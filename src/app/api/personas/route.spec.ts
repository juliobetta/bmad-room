import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * HTTP-route coverage for GET /api/personas, following
 * `src/lib/projects.spec.ts`'s pattern: reset the module registry and the
 * `src/lib/db.ts` `globalThis` singletons, point `BMAD_ROOM_DB_PATH` at a
 * fresh in-memory database, then dynamically import the route module so it
 * syncs the real persona catalog against that database.
 */
describe('HTTP routes: GET /api/personas', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.__bmadRoomDb = undefined;
    globalThis.__bmadRoomPersonasSynced = undefined;
    process.env.BMAD_ROOM_DB_PATH = ':memory:';
  });

  afterEach(() => {
    delete process.env.BMAD_ROOM_DB_PATH;
  });

  test('returns the synced persona catalog', async () => {
    const { personasRepo } = await import('@/lib/db');
    const route = await import('./route');

    const res = await route.GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    const expected = personasRepo.list();
    expect(expected.length).toBeGreaterThan(0);
    expect(body).toEqual(expected);
  });
});
