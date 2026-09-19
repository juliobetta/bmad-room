import type { Project } from '@/api/types';

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
  const last = segments[segments.length - 1];
  return last ?? project.path;
}

function projectInitial(label: string): string {
  return label.charAt(0).toUpperCase() || '?';
}

export function ProjectRail({ projects, activeProjectId, onSelect, onAddClick }: ProjectRailProps) {
  return (
    <nav
      className="flex w-16 flex-none flex-col items-center gap-2 border-r border-[var(--border)] bg-[var(--surface-raised)] py-3"
      aria-label="Projects"
    >
      {projects.length === 0 ? (
        <p className="m-0 mb-3 px-2 text-center text-xs font-medium text-[var(--text-muted)]">
          No projects yet — add one to start chatting.
        </p>
      ) : (
        <ul className="m-0 flex w-full list-none flex-col items-center gap-2 p-0">
          {projects.map((project) => {
            const label = projectLabel(project);
            const isActive = project.id === activeProjectId;
            return (
              <li key={project.id}>
                <button
                  type="button"
                  className={`relative h-10 w-10 rounded-[10px] border font-semibold text-[var(--text-primary)] ${
                    isActive ? 'border-[var(--primary)] shadow-[inset_3px_0_0_var(--accent)]' : 'border-[var(--border)]'
                  } bg-[var(--surface-base)]`}
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

      <button
        type="button"
        className="mt-auto h-10 w-10 rounded-[10px] border border-[var(--border)] bg-transparent text-xl leading-none text-[var(--text-primary)]"
        aria-label="Add project"
        title="Add project"
        onClick={onAddClick}
      >
        +
      </button>
    </nav>
  );
}
