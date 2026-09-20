export interface Project {
  id: string;
  path: string;
  createdAt: string;
}

export interface BrowseEntry {
  name: string;
  path: string;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
}

export interface ApiErrorBody {
  error: string;
}

export interface Persona {
  agentSkillId: string;
  name: string;
  title: string;
  icon: string;
  description: string;
  module: string;
  status: 'active' | 'removed';
  syncedAt: string;
}

export type ThreadStatus = 'idle' | 'working' | 'needs-input' | 'stopped';

export interface Thread {
  id: string;
  projectId: string;
  personaId: string | null;
  kind: 'dm' | 'channel';
  status: ThreadStatus;
  createdAt: string;
}
