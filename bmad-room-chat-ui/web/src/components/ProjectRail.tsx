import type { Project } from '../api/types';

/**
 * Leftmost icon-only rail (EXPERIENCE.md Information Architecture): one
 * icon per registered project, "+" affordance to add a project, empty
 * state copy when none exist yet. DESIGN.md project-rail-icon: 40px
 * square, {rounded.md}, active project gets an accent left-edge indicator.
 */

interface ProjectRailProps {
  projects: Project[];
  activeProjectId: string | null;
  onSelect: (id: string) => void;
  onAddClick: () => void;
}

function projectLabel(project: Project): string {
  const segments = project.path.split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : project.path;
}

function projectInitial(label: string): string {
  return label.charAt(0).toUpperCase() || '?';
}

export function ProjectRail({ projects, activeProjectId, onSelect, onAddClick }: ProjectRailProps) {
  return (
    <nav className="project-rail" aria-label="Projects">
      {projects.length === 0 ? (
        <p className="project-rail__empty">No projects yet — add one to start chatting.</p>
      ) : (
        <ul className="project-rail__list">
          {projects.map((project) => {
            const label = projectLabel(project);
            const isActive = project.id === activeProjectId;
            return (
              <li key={project.id}>
                <button
                  type="button"
                  className={`project-rail__icon${isActive ? ' project-rail__icon--active' : ''}`}
                  aria-label={project.path}
                  aria-current={isActive ? 'true' : undefined}
                  title={project.path}
                  onClick={() => onSelect(project.id)}
                >
                  {projectInitial(label)}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button type="button" className="project-rail__add" aria-label="Add project" title="Add project" onClick={onAddClick}>
        +
      </button>
    </nav>
  );
}
