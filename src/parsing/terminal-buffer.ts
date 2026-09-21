import xtermHeadless from '@xterm/headless';

// `@xterm/headless` ships no `exports` map, so Node's native ESM loader
// (used by `tsx`) falls back to CJS interop and only exposes `default` —
// `import { Terminal }` resolves fine under Vitest's bundler-based module
// resolution but fails at real runtime, so a default import + destructure
// is required here.
const { Terminal } = xtermHeadless;
type Terminal = InstanceType<typeof xtermHeadless.Terminal>;

/**
 * Per-thread `@xterm/headless` buffer wrapper (Code Map). Raw pty bytes
 * (cursor moves, carriage-return spinners, ANSI color codes, etc.) are fed
 * in via `write()`; a real terminal emulator renders them into a grid of
 * cells, and only *settled* rows — rows strictly above the live cursor
 * row, which a carriage-return/spinner redraw can no longer rewrite — are
 * emitted as de-flickered plain-text lines to `onLine`. This is the single
 * point raw bytes get turned into text; `classifier.ts` only ever sees
 * this output, never raw pty bytes.
 */
export class TerminalBuffer {
  private readonly terminal: Terminal;
  private settledUpTo = 0;

  constructor(
    private readonly onLine: (line: string) => void,
    options: { cols?: number; rows?: number; scrollback?: number } = {},
  ) {
    this.terminal = new Terminal({
      cols: options.cols ?? 120,
      rows: options.rows ?? 40,
      scrollback: options.scrollback ?? 10_000,
      allowProposedApi: true,
    });
  }

  /** Feeds a raw chunk from the pty into the terminal emulator. */
  write(chunk: string): void {
    this.terminal.write(chunk, () => this.flushSettledLines());
  }

  /** Forces any not-yet-settled trailing content to flush (e.g. on turn end). */
  flush(): void {
    this.flushSettledLines(true);
  }

  dispose(): void {
    this.terminal.dispose();
  }

  private flushSettledLines(includeCursorRow = false): void {
    const buffer = this.terminal.buffer.active;
    const cursorAbsoluteRow = buffer.baseY + buffer.cursorY;
    const upperBound = includeCursorRow ? cursorAbsoluteRow + 1 : cursorAbsoluteRow;

    for (let row = this.settledUpTo; row < upperBound; row++) {
      const line = buffer.getLine(row);
      if (!line) break;
      this.onLine(line.translateToString(true));
    }
    this.settledUpTo = Math.max(this.settledUpTo, upperBound);
  }
}
