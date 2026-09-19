'use client';

import { useEffect, useState } from 'react';
import { ApiError, browse, createProject } from '@/api/client';
import type { BrowseResult, Project } from '@/api/types';

/**
 * Breadcrumb directory browser against `GET /api/fs/browse` (AD-7). No
 * client-supplied path reaches `POST /api/projects` unvalidated — every
 * path shown/selected here was resolved and returned by the backend.
 */

interface AddProjectBrowserProps {
  onCreated: (project: Project) => void;
  onClose: () => void;
}

function breadcrumbSegments(absolutePath: string): { label: string; path: string }[] {
  const parts = absolutePath.split('/').filter(Boolean);
  const segments: { label: string; path: string }[] = [{ label: '/', path: '/' }];
  let running = '';
  for (const part of parts) {
    running += `/${part}`;
    segments.push({ label: part, path: running });
  }
  return segments;
}

export function AddProjectBrowser({ onCreated, onClose }: AddProjectBrowserProps) {
  const [result, setResult] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = (path?: string | null) => {
    setLoading(true);
    setBrowseError(null);
    browse(path)
      .then((r) => setResult(r))
      .catch((err: unknown) => setBrowseError(err instanceof Error ? err.message : 'Failed to browse directory'))
      .finally(() => setLoading(false));
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only initial load
  useEffect(() => {
    load(undefined);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!result) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const project = await createProject(result.path);
      onCreated(project);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Failed to add project');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: decorative backdrop; Escape (handled above) and the explicit Close button already provide keyboard-accessible dismissal
    <div className="fixed inset-0 flex items-center justify-center bg-black/35" role="presentation" onClick={onClose}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only, not a standalone interactive affordance — dialog contents remain keyboard-navigable via their own controls */}
      <div
        className="flex max-h-[70vh] w-[480px] max-w-[calc(100vw-32px)] flex-col gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-raised)] p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Add project"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between">
          <h2 className="m-0 text-[15px] font-semibold">Add project</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </header>

        {result && (
          <nav aria-label="Breadcrumb" className="overflow-x-auto whitespace-nowrap font-mono text-[13px]">
            {breadcrumbSegments(result.path).map((segment, index, arr) => (
              <span key={segment.path}>
                <button
                  type="button"
                  className="border-none bg-none p-0 text-[var(--primary)]"
                  onClick={() => load(segment.path)}
                >
                  {segment.label}
                </button>
                {index < arr.length - 1 && <span aria-hidden="true"> / </span>}
              </span>
            ))}
          </nav>
        )}

        {loading && <p>Loading…</p>}
        {browseError && (
          <p className="m-0 text-[13px] text-[#b3261e]" role="alert">
            {browseError}
          </p>
        )}

        {!loading && !browseError && result && (
          <ul className="m-0 flex-1 list-none overflow-y-auto p-0">
            {result.entries.length === 0 && <li className="px-0 py-2 text-[var(--text-muted)]">No subdirectories</li>}
            {result.entries.map((entry) => (
              <li key={entry.path} className="border-b border-[var(--border)]">
                <button
                  type="button"
                  className="w-full border-none bg-none px-1 py-2 text-left text-sm text-[var(--text-primary)]"
                  onClick={() => load(entry.path)}
                >
                  {entry.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {submitError && (
          <p className="m-0 text-[13px] text-[#b3261e]" role="alert">
            {submitError}
          </p>
        )}

        <footer className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-[6px] border border-[var(--border)] bg-transparent px-3 py-2 text-[var(--text-primary)]"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-[6px] border-none bg-[var(--primary)] px-3 py-2 text-[var(--primary-foreground)]"
            onClick={handleSubmit}
            disabled={!result || submitting}
          >
            {submitting ? 'Adding…' : 'Add this folder'}
          </button>
        </footer>
      </div>
    </div>
  );
}
