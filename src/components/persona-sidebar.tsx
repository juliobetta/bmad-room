import type { Persona } from '@/api/types';

/**
 * Persona/channel sidebar, scoped to the active project (EXPERIENCE.md
 * Information Architecture). One row per synced BMad persona: icon, name,
 * title, and a presence dot — muted for idle, distinct badge for a
 * `removed` persona. A removed persona's row stays clickable (its existing
 * Thread and full history must remain viewable per Story 1.3's AC — only
 * the composer becomes disabled, not the ability to open the thread); the
 * backend refuses to *create* a new Thread for a removed persona, so a
 * removed persona with no prior Thread surfaces that as a request error
 * instead of opening. Mirrors `project-rail.tsx`'s Tailwind/aria conventions.
 */

interface PersonaSidebarProps {
  personas: Persona[];
  activePersonaId: string | null;
  onSelect: (agentSkillId: string) => void;
}

export function PersonaSidebar({ personas, activePersonaId, onSelect }: PersonaSidebarProps) {
  return (
    <nav
      className="flex w-56 flex-none flex-col gap-1 border-r border-[var(--border)] bg-[var(--surface-raised)] p-2"
      aria-label="Personas"
    >
      {personas.length === 0 ? (
        <p className="m-0 px-2 py-1 text-xs font-medium text-[var(--text-muted)]">No personas synced yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {personas.map((persona) => {
            const isActive = persona.agentSkillId === activePersonaId;
            const isRemoved = persona.status === 'removed';
            return (
              <li key={persona.agentSkillId}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 rounded-[10px] border px-2 py-1.5 text-left text-sm text-[var(--text-primary)] ${
                    isActive ? 'border-[var(--primary)]' : 'border-transparent'
                  } bg-[var(--surface-base)] ${isRemoved ? 'opacity-60' : ''}`}
                  aria-current={isActive ? 'true' : undefined}
                  title={`${persona.name} — ${persona.title}${isRemoved ? ' (removed)' : ''}`}
                  onClick={() => onSelect(persona.agentSkillId)}
                >
                  <span aria-hidden="true">{persona.icon}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{persona.name}</span>
                    <span className="truncate text-xs text-[var(--text-muted)]">{persona.title}</span>
                  </span>
                  {isRemoved ? (
                    <span className="flex-none rounded-[6px] border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                      Removed
                    </span>
                  ) : (
                    <span className="flex flex-none items-center" title="Idle">
                      <span className="h-2 w-2 rounded-full bg-[var(--text-muted)]" aria-hidden="true" />
                      <span className="sr-only">Idle</span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
