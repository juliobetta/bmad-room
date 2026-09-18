import { useEffect, useState } from 'react';
import './App.css';
import { AddProjectBrowser } from './components/AddProjectBrowser';
import { ProjectRail } from './components/ProjectRail';
import { fetchProjects } from './api/client';
import type { Project } from './api/types';
import { setActiveProjectId, useActiveProjectId } from './state/activeProject';

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const activeProjectId = useActiveProjectId();

  useEffect(() => {
    fetchProjects()
      .then((loaded) => {
        setProjects(loaded);
        if (loaded.length > 0 && !loaded.some((p) => p.id === activeProjectId)) {
          setActiveProjectId(loaded[0].id);
        }
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : 'Failed to load projects'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreated = (project: Project) => {
    setProjects((prev) => [...prev, project]);
    setActiveProjectId(project.id);
    setBrowserOpen(false);
  };

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  return (
    <div className="app-shell">
      <ProjectRail
        projects={projects}
        activeProjectId={activeProjectId}
        onSelect={setActiveProjectId}
        onAddClick={() => setBrowserOpen(true)}
      />

      <main className="app-shell__main">
        {loadError && (
          <p role="alert" className="app-shell__error">
            {loadError}
          </p>
        )}
        {!loadError && activeProject && (
          <p className="app-shell__placeholder">
            Active project: <strong>{activeProject.path}</strong>
          </p>
        )}
        {!loadError && !activeProject && <p className="app-shell__placeholder">Add a project to start chatting.</p>}
      </main>

      {browserOpen && <AddProjectBrowser onCreated={handleCreated} onClose={() => setBrowserOpen(false)} />}
    </div>
  );
}

export default App;
