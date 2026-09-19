'use client';

import { useEffect, useState } from 'react';
import { fetchProjects } from '@/api/client';
import type { Project } from '@/api/types';
import { AddProjectBrowser } from '@/components/add-project-browser';
import { ProjectRail } from '@/components/project-rail';
import { setActiveProjectId, useActiveProjectId } from '@/state/active-project';

export default function Page() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const activeProjectId = useActiveProjectId();

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
  }, []);

  const handleCreated = (project: Project) => {
    setProjects((prev) => [...prev, project]);
    setActiveProjectId(project.id);
    setBrowserOpen(false);
  };

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  return (
    <div className="flex min-h-screen">
      <ProjectRail
        projects={projects}
        activeProjectId={activeProjectId}
        onSelect={setActiveProjectId}
        onAddClick={() => setBrowserOpen(true)}
      />

      <main className="flex-1 p-8">
        {loadError && (
          <p role="alert" className="text-[#b3261e]">
            {loadError}
          </p>
        )}
        {!loadError && activeProject && (
          <p className="text-[var(--text-muted)]">
            Active project: <strong>{activeProject.path}</strong>
          </p>
        )}
        {!loadError && !activeProject && <p className="text-[var(--text-muted)]">Add a project to start chatting.</p>}
      </main>

      {browserOpen && <AddProjectBrowser onCreated={handleCreated} onClose={() => setBrowserOpen(false)} />}
    </div>
  );
}
