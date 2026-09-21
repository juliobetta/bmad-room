import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * HTTP-route coverage for GET /api/threads/[id]/messages, following
 * `src/app/api/projects/[id]/threads/route.spec.ts`'s pattern: reset the
 * module registry and the `src/lib/db.ts` `globalThis` singleton cache,
 * point `BMAD_ROOM_DB_PATH` at a fresh in-memory database, then dynamically
 * import both the db singletons (to seed fixtures) and the route module
 * under test so they share the same in-memory database instance.
 */
describe('HTTP route: GET /api/threads/[id]/messages', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.__bmadRoomDb = undefined;
    globalThis.__bmadRoomPersonasSynced = undefined;
    process.env.BMAD_ROOM_DB_PATH = ':memory:';
  });

  afterEach(() => {
    delete process.env.BMAD_ROOM_DB_PATH;
  });

  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  test('returns 422 for an unknown thread', async () => {
    const route = await import('./route');
    const res = await route.GET(new Request('http://localhost/api/threads/nope/messages'), makeParams('nope'));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'Thread not found' });
  });

  test('returns an empty array for a thread with no messages', async () => {
    const { projectsRepo, personasRepo, threadsRepo } = await import('@/lib/db');
    const route = await import('./route');
    const project = projectsRepo.create('/Users/example/repo');
    const personaId = personasRepo.list()[0]?.agentSkillId as string;
    const thread = threadsRepo.findOrCreateDm(project.id, personaId);

    const res = await route.GET(
      new Request(`http://localhost/api/threads/${thread.id}/messages`),
      makeParams(thread.id),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test('returns messages newest-first, respecting a custom limit', async () => {
    const { projectsRepo, personasRepo, threadsRepo, messagesRepo } = await import('@/lib/db');
    const route = await import('./route');
    const project = projectsRepo.create('/Users/example/repo');
    const personaId = personasRepo.list()[0]?.agentSkillId as string;
    const thread = threadsRepo.findOrCreateDm(project.id, personaId);

    messagesRepo.create(thread.id, 'text', 'first');
    messagesRepo.create(thread.id, 'text', 'second');
    messagesRepo.create(thread.id, 'text', 'third');

    const res = await route.GET(
      new Request(`http://localhost/api/threads/${thread.id}/messages?limit=2`),
      makeParams(thread.id),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { content: string }[];
    expect(body.map((m) => m.content)).toEqual(['third', 'second']);
  });

  test('supports before= pagination', async () => {
    const { projectsRepo, personasRepo, threadsRepo, messagesRepo } = await import('@/lib/db');
    const route = await import('./route');
    const project = projectsRepo.create('/Users/example/repo');
    const personaId = personasRepo.list()[0]?.agentSkillId as string;
    const thread = threadsRepo.findOrCreateDm(project.id, personaId);

    messagesRepo.create(thread.id, 'text', 'first');
    messagesRepo.create(thread.id, 'text', 'second');
    const third = messagesRepo.create(thread.id, 'text', 'third');

    const res = await route.GET(
      new Request(`http://localhost/api/threads/${thread.id}/messages?before=${third.id}`),
      makeParams(thread.id),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { content: string }[];
    expect(body.map((m) => m.content)).toEqual(['second', 'first']);
  });

  test('returns 422 for a non-positive-integer limit', async () => {
    const { projectsRepo, personasRepo, threadsRepo } = await import('@/lib/db');
    const route = await import('./route');
    const project = projectsRepo.create('/Users/example/repo');
    const personaId = personasRepo.list()[0]?.agentSkillId as string;
    const thread = threadsRepo.findOrCreateDm(project.id, personaId);

    const res = await route.GET(
      new Request(`http://localhost/api/threads/${thread.id}/messages?limit=0`),
      makeParams(thread.id),
    );
    expect(res.status).toBe(422);
  });
});
