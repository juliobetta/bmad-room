import { describe, expect, test } from 'vitest';
import { classifyLine } from './classifier';

describe('classifyLine', () => {
  test('classifies a blank line as ignore', () => {
    expect(classifyLine('')).toEqual({ kind: 'ignore' });
    expect(classifyLine('   ')).toEqual({ kind: 'ignore' });
  });

  test('classifies a bare idle prompt as status idle', () => {
    expect(classifyLine('>')).toEqual({ kind: 'status', status: 'idle' });
    expect(classifyLine('> ')).toEqual({ kind: 'status', status: 'idle' });
  });

  test('classifies a spinner line as status working', () => {
    expect(classifyLine('⠋ Thinking…')).toEqual({ kind: 'status', status: 'working' });
    expect(classifyLine('✳ Reading file…')).toEqual({ kind: 'status', status: 'working' });
  });

  test('classifies an Error:/Failed:/Warning: line as system', () => {
    expect(classifyLine('Error: something went wrong')).toEqual({
      kind: 'system',
      text: 'Error: something went wrong',
    });
    expect(classifyLine('Failed: could not reach host')).toEqual({
      kind: 'system',
      text: 'Failed: could not reach host',
    });
    expect(classifyLine('Warning: deprecated flag')).toEqual({
      kind: 'system',
      text: 'Warning: deprecated flag',
    });
  });

  test('classifies ordinary text as a message', () => {
    expect(classifyLine('Hello, here is my answer.')).toEqual({
      kind: 'message',
      text: 'Hello, here is my answer.',
    });
  });

  test('trims trailing whitespace but preserves internal spacing for message lines', () => {
    expect(classifyLine('two  spaces   here   ')).toEqual({
      kind: 'message',
      text: 'two  spaces   here',
    });
  });

  test('does not misclassify a word merely containing "error" as system', () => {
    expect(classifyLine('erroneous input handling')).toEqual({
      kind: 'message',
      text: 'erroneous input handling',
    });
  });
});
