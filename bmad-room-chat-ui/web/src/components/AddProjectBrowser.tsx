import { useEffect, useState } from 'react';
import { ApiError, browse, createProject } from '../api/client';
import type { BrowseResult, Project } from '../api/types';

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

  useEffect(() => {
    load(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="add-project-browser__backdrop" role="presentation" onClick={onClose}>
      <div
        className="add-project-browser"
        role="dialog"
        aria-modal="true"
        aria-label="Add project"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="add-project-browser__header">
          <h2>Add project</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </header>

        {result && (
          <nav aria-label="Breadcrumb" className="add-project-browser__breadcrumb">
            {breadcrumbSegments(result.path).map((segment, index, arr) => (
              <span key={segment.path}>
                <button type="button" onClick={() => load(segment.path)}>
                  {segment.label}
                </button>
                {index < arr.length - 1 && <span aria-hidden="true"> / </span>}
              </span>
            ))}
          </nav>
        )}

        {loading && <p>Loading…</p>}
        {browseError && (
          <p className="add-project-browser__error" role="alert">
            {browseError}
          </p>
        )}

        {!loading && !browseError && result && (
          <ul className="add-project-browser__list">
            {result.entries.length === 0 && <li className="add-project-browser__empty">No subdirectories</li>}
            {result.entries.map((entry) => (
              <li key={entry.path}>
                <button type="button" onClick={() => load(entry.path)}>
                  {entry.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {submitError && (
          <p className="add-project-browser__error" role="alert">
            {submitError}
          </p>
        )}

        <footer className="add-project-browser__footer">
          <button type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={!result || submitting}>
            {submitting ? 'Adding…' : 'Add this folder'}
          </button>
        </footer>
      </div>
    </div>
  );
}
