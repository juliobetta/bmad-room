import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import type { ProjectsRepo } from '../persistence/projectsRepo.js';
import { browseDirectory, BrowseError } from './fsBrowse.js';
import { createProject, listProjects } from './projects.js';

// The web dev server's own origin (Vite default port 5173) — configurable to
// match how vite.config.ts's BACKEND_PORT is handled. Never '*': this API is
// unauthenticated and must not be reachable from an arbitrary open tab.
const ALLOWED_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Bootstrap REST layer (Consistency Conventions: "Project list ... fetched
 * via a plain REST layer"). This story only wires `/api/fs/browse` (AD-7)
 * and `/api/projects` — no WS server, no Thread/Message endpoints.
 */
export function createServer(repo: ProjectsRepo): http.Server {
  return http.createServer((req, res) => {
    void handleRequest(repo, req, res);
  });
}

async function handleRequest(repo: ProjectsRepo, req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', 'http://localhost');

  try {
    if (req.method === 'GET' && url.pathname === '/api/fs/browse') {
      const result = await browseDirectory(url.searchParams.get('path'));
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/projects') {
      sendJson(res, 200, listProjects(repo));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/projects') {
      let body: unknown;
      try {
        body = await readJsonBody(req);
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      const result = await createProject(repo, body);
      sendJson(res, result.status, result.body);
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    if (err instanceof BrowseError) {
      sendJson(res, 400, { error: err.message });
      return;
    }
    sendJson(res, 500, { error: 'Internal server error' });
  }
}
