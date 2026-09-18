import path from 'node:path';
import Database from 'better-sqlite3';
import { initSchema } from './persistence/schema.js';
import { ProjectsRepo } from './persistence/projectsRepo.js';
import { createServer } from './http/server.js';

const DB_PATH = process.env.BMAD_ROOM_DB_PATH ?? path.join(process.cwd(), 'bmad-room.db');
const PORT = Number(process.env.PORT ?? 4317);

const db = new Database(DB_PATH);
initSchema(db);
const repo = new ProjectsRepo(db);

const server = createServer(repo);
server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`bmad-room-chat-ui backend listening on http://localhost:${PORT}`);
});
