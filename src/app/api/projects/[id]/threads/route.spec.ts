import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * HTTP-route coverage for GET/POST /api/projects/[id]/threads, following
 * `src/lib/projects.spec.ts`'s pattern: reset the module registry and the
 * `src/lib/db.ts` `globalThis` singleton cache, point `BMAD_ROOM_DB_PATH`
 * at a fresh in-memory database, then dynamically import both the db
 * singletons (to seed fixtures) and the route module under test so they
 * share the same in-memory database instance.
 */
describe('HTTP routes: GET/POST /api/projects/[id]/threads', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.__bmadRoomDb = undefined;
    process.env.BMAD_ROOM_DB_PATH = ':memory:';
  });

  afterEach(() => {
    delete process.env.BMAD_ROOM_DB_PATH;
  });

  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  test('GET returns 422 for an unknown project', async () => {
    const route = await import('./route');
    const res = await route.GET(new Request('http://localhost/api/projects/nope/threads'), makeParams('nope'));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'Project not found' });
  });

  test('GET returns the threads for a known project', async () => {
    const { projectsRepo, personasRepo, threadsRepo } = await import('@/lib/db');
    const route = await import('./route');

    const project = projectsRepo.create('/Users/example/repo');
    const personaId = personasRepo.list()[0]?.agentSkillId;
    expect(personaId).toBeDefined();
    const thread = threadsRepo.findOrCreateDm(project.id, personaId as string);

    const res = await route.GET(
      new Request(`http://localhost/api/projects/${project.id}/threads`),
      makeParams(project.id),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([thread]);
  });

  test('POST with malformed JSON returns 400', async () => {
    const { projectsRepo } = await import('@/lib/db');
    const route = await import('./route');
    const project = projectsRepo.create('/Users/example/repo');

    const res = await route.POST(
      new Request(`http://localhost/api/projects/${project.id}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not valid json',
      }),
      makeParams(project.id),
    );
    expect(res.status).toBe(400);
  });

  test('POST with a missing personaId returns 422', async () => {
    const { projectsRepo } = await import('@/lib/db');
    const route = await import('./route');
    const project = projectsRepo.create('/Users/example/repo');

    const res = await route.POST(
      new Request(`http://localhost/api/projects/${project.id}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      makeParams(project.id),
    );
    expect(res.status).toBe(422);
  });

  test('POST for an unknown project returns 422', async () => {
    const { personasRepo } = await import('@/lib/db');
    const route = await import('./route');
    const personaId = personasRepo.list()[0]?.agentSkillId as string;

    const res = await route.POST(
      new Request('http://localhost/api/projects/nope/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId }),
      }),
      makeParams('nope'),
    );
    expect(res.status).toBe(422);
  });

  test('POST for an unknown persona returns 422', async () => {
    const { projectsRepo } = await import('@/lib/db');
    const route = await import('./route');
    const project = projectsRepo.create('/Users/example/repo');

    const res = await route.POST(
      new Request(`http://localhost/api/projects/${project.id}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId: 'does-not-exist' }),
      }),
      makeParams(project.id),
    );
    expect(res.status).toBe(422);
  });

  test('POST creates a dm Thread for a valid project + persona, and reopens it on a second call', async () => {
    const { projectsRepo, personasRepo } = await import('@/lib/db');
    const route = await import('./route');
    const project = projectsRepo.create('/Users/example/repo');
    const personaId = personasRepo.list()[0]?.agentSkillId as string;

    const postRequest = () =>
      route.POST(
        new Request(`http://localhost/api/projects/${project.id}/threads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ personaId }),
        }),
        makeParams(project.id),
      );

    const first = await postRequest();
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { id: string; kind: string };
    expect(firstBody.kind).toBe('dm');

    const second = await postRequest();
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { id: string };
    expect(secondBody.id).toBe(firstBody.id);
  });

  test('POST for a removed persona with an existing thread reopens that thread (200) rather than blocking it', async () => {
    const { projectsRepo, personasRepo, threadsRepo } = await import('@/lib/db');
    const route = await import('./route');
    const project = projectsRepo.create('/Users/example/repo');

    const allIds = personasRepo.list().map((p) => p.agentSkillId);
    const personaId = allIds[0] as string;
    const existing = threadsRepo.findOrCreateDm(project.id, personaId);

    // Mark this persona removed by re-syncing with every *other* id still present.
    personasRepo.markRemoved(allIds.filter((id) => id !== personaId));
    expect(personasRepo.findById(personaId)?.status).toBe('removed');

    const res = await route.POST(
      new Request(`http://localhost/api/projects/${project.id}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId }),
      }),
      makeParams(project.id),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(existing);
  });

  test('POST for a removed persona with no existing thread returns 422', async () => {
    const { projectsRepo, personasRepo } = await import('@/lib/db');
    const route = await import('./route');
    const project = projectsRepo.create('/Users/example/repo');

    const allIds = personasRepo.list().map((p) => p.agentSkillId);
    const personaId = allIds[0] as string;
    personasRepo.markRemoved(allIds.filter((id) => id !== personaId));
    expect(personasRepo.findById(personaId)?.status).toBe('removed');

    const res = await route.POST(
      new Request(`http://localhost/api/projects/${project.id}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId }),
      }),
      makeParams(project.id),
    );
    expect(res.status).toBe(422);
  });
});
