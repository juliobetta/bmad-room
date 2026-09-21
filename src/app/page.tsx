'use client';

import { useEffect, useState } from 'react';
import { fetchMessages, fetchPersonas, fetchProjects, openThread } from '@/api/client';
import type { Message, Persona, Project, Thread } from '@/api/types';
import { AddProjectBrowser } from '@/components/add-project-browser';
import { Composer } from '@/components/composer';
import { MessageList } from '@/components/message-list';
import { PersonaSidebar } from '@/components/persona-sidebar';
import { ProjectRail } from '@/components/project-rail';
import { setActivePersonaId, useActivePersonaId } from '@/state/active-persona';
import { setActiveProjectId, useActiveProjectId } from '@/state/active-project';
import { useThreadSocket } from '@/state/thread-socket';

export default function Page() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [thread, setThread] = useState<Thread | null>(null);
  const [history, setHistory] = useState<Message[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const activeProjectId = useActiveProjectId();
  const activePersonaId = useActivePersonaId();
  const threadId = thread?.id ?? null;
  const socket = useThreadSocket(threadId);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only fetch; activeProjectId is read from localStorage synchronously at module init, re-running this on every change would refetch needlessly
  useEffect(() => {
    fetchProjects()
      .then((loaded) => {
        setProjects(loaded);
        const first = loaded[0];
        if (first && !loaded.some((p) => p.id === activeProjectId)) {
          setActiveProjectId(first.id);
        }
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : 'Failed to load projects'));

    fetchPersonas()
      .then(setPersonas)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : 'Failed to load personas'));
  }, []);

  // Whenever the active project or persona changes, find-or-create the DM
  // thread for that pair (no pty spawned — Story 1.4 wires actual
  // execution). Clears the thread panel when no persona is selected yet.
  useEffect(() => {
    if (!activeProjectId || !activePersonaId) {
      setThread(null);
      return;
    }
    let cancelled = false;
    setThreadError(null);
    openThread(activeProjectId, activePersonaId)
      .then((opened) => {
        if (!cancelled) setThread(opened);
      })
      .catch((err: unknown) => {
        if (!cancelled) setThreadError(err instanceof Error ? err.message : 'Failed to open thread');
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, activePersonaId]);

  // REST bootstrap of a thread's message history, loaded before/independent
  // of the WS connection `useThreadSocket` opens (Consistency Conventions:
  // "history loads via REST before a thread's WS connection opens").
  // Newest-page-first from the API — reversed here for chronological
  // display.
  useEffect(() => {
    if (!threadId) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    fetchMessages(threadId)
      .then((loaded) => {
        if (!cancelled) setHistory([...loaded].reverse());
      })
      .catch((err: unknown) => {
        if (!cancelled) setThreadError(err instanceof Error ? err.message : 'Failed to load message history');
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  const historyIds = new Set(history.map((m) => m.id));
  const displayedMessages = [...history, ...socket.liveMessages.filter((m) => !historyIds.has(m.id))];

  const handleCreated = (project: Project) => {
    setProjects((prev) => [...prev, project]);
    setActiveProjectId(project.id);
    setBrowserOpen(false);
  };

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const activePersona = personas.find((p) => p.agentSkillId === activePersonaId) ?? null;

  return (
    <div className="flex min-h-screen">
      <ProjectRail
        projects={projects}
        activeProjectId={activeProjectId}
        onSelect={setActiveProjectId}
        onAddClick={() => setBrowserOpen(true)}
      />

      {loadError ? (
        <main className="flex-1 p-8">
          <p role="alert" className="text-[#b3261e]">
            {loadError}
          </p>
        </main>
      ) : activeProject ? (
        <>
          <PersonaSidebar personas={personas} activePersonaId={activePersonaId} onSelect={setActivePersonaId} />

          <main className="flex flex-1 flex-col overflow-hidden">
            {threadError && (
              <p role="alert" className="m-0 p-8 text-[#b3261e]">
                {threadError}
              </p>
            )}
            {!threadError && activePersona && thread && (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-none border-b border-[var(--border)] p-4 text-[var(--text-muted)]">
                  <p className="m-0">
                    {activePersona.name} — <strong>{activePersona.title}</strong>
                  </p>
                </div>
                {socket.connectionError && (
                  <p role="alert" className="m-0 flex-none bg-[#fdecea] px-4 py-2 text-sm text-[#b3261e]">
                    {socket.connectionError}
                  </p>
                )}
                <MessageList
                  messages={displayedMessages}
                  personas={personas}
                  streaming={socket.streaming}
                  status={socket.status}
                />
                <Composer
                  disabled={activePersona.status === 'removed'}
                  disabledReason="This persona has been removed."
                  onSend={(text) => socket.sendMessage(text)}
                />
              </div>
            )}
            {!threadError && !activePersona && (
              <p className="m-0 p-8 text-[var(--text-muted)]">Select a persona to start a conversation.</p>
            )}
          </main>
        </>
      ) : (
        <main className="flex-1 p-8">
          <p className="text-[var(--text-muted)]">Add a project to start chatting.</p>
        </main>
      )}

      {browserOpen && <AddProjectBrowser onCreated={handleCreated} onClose={() => setBrowserOpen(false)} />}
    </div>
  );
}
