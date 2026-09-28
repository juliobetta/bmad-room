import { describe, expect, test } from 'vitest';
import { parseCardContent } from './card-content';

describe('parseCardContent', () => {
  test('parses a well-formed {summary, detail} JSON payload', () => {
    expect(parseCardContent(JSON.stringify({ summary: '⏺ Read(src/api/auth.ts)', detail: 'Read 120 lines' }))).toEqual({
      summary: '⏺ Read(src/api/auth.ts)',
      detail: 'Read 120 lines',
    });
  });

  test('defaults a missing detail to an empty string', () => {
    expect(parseCardContent(JSON.stringify({ summary: '⏺ Read(src/api/auth.ts)' }))).toEqual({
      summary: '⏺ Read(src/api/auth.ts)',
      detail: '',
    });
  });

  test('defaults a missing summary to an empty string', () => {
    expect(parseCardContent(JSON.stringify({ detail: 'some detail' }))).toEqual({
      summary: '',
      detail: 'some detail',
    });
  });

  test('falls back to treating unparsable content as a bare summary with no detail', () => {
    expect(parseCardContent('not json')).toEqual({ summary: 'not json', detail: '' });
  });
});
