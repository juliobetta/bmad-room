'use client';

import { type KeyboardEvent, useState } from 'react';

/**
 * Text input, Enter sends / Shift+Enter newline, disabled when the active
 * persona is `removed` (existing disabled-state convention from Story 1.3).
 */

interface ComposerProps {
  disabled: boolean;
  disabledReason?: string;
  onSend: (text: string) => void;
}

export function Composer({ disabled, disabledReason, onSend }: ComposerProps) {
  const [value, setValue] = useState('');

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-none items-end gap-2 border-t border-[var(--border)] bg-[var(--surface-raised)] p-3">
      <label className="sr-only" htmlFor="composer-input">
        Message
      </label>
      <textarea
        id="composer-input"
        className="min-h-10 flex-1 resize-none rounded-[10px] border border-[var(--border)] bg-[var(--surface-base)] p-2 text-sm text-[var(--text-primary)] disabled:opacity-60"
        rows={1}
        value={value}
        disabled={disabled}
        placeholder={disabled ? (disabledReason ?? 'This persona has been removed.') : 'Message…'}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button
        type="button"
        className="h-10 flex-none rounded-[10px] border border-[var(--border)] bg-[var(--primary)] px-4 text-sm font-medium text-[var(--primary-foreground)] disabled:opacity-60"
        disabled={disabled || value.trim().length === 0}
        onClick={handleSend}
      >
        Send
      </button>
    </div>
  );
}
