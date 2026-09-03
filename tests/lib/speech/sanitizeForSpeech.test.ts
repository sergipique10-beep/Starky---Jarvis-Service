import { describe, it, expect } from 'vitest';
import { sanitizeForSpeech } from '@/lib/speech/sanitizeForSpeech';

describe('sanitizeForSpeech', () => {
  it('strips bold and italic markers', () => {
    expect(sanitizeForSpeech('Soy **Jarvis**, tu *asistente*')).toBe('Soy Jarvis, tu asistente');
  });

  it('strips inline code backticks', () => {
    expect(sanitizeForSpeech('Corré `npm install`')).toBe('Corré npm install');
  });

  it('strips fenced code blocks entirely', () => {
    expect(sanitizeForSpeech('Mirá esto:\n```js\nconst x = 1;\n```\nlisto')).toBe('Mirá esto: listo');
  });

  it('strips headers and bullet markers', () => {
    expect(sanitizeForSpeech('# Título\n- primero\n- segundo')).toBe('Título primero segundo');
  });

  it('converts links to their text', () => {
    expect(sanitizeForSpeech('Mirá [la doc](https://example.com/x)')).toBe('Mirá la doc');
  });

  it('strips stray slashes and pipes', () => {
    expect(sanitizeForSpeech('usá /comando o el flag --a|--b')).toBe('usá comando o el flag --a--b');
  });

  it('leaves plain text untouched', () => {
    expect(sanitizeForSpeech('Hola, soy Jarvis.')).toBe('Hola, soy Jarvis.');
  });
});
