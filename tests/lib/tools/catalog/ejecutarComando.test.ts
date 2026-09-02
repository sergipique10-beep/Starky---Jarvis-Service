import { describe, it, expect } from 'vitest';
import { ejecutarComando } from '@/lib/tools/catalog/ejecutarComando';

describe('ejecutar_comando', () => {
  it('is risk level 3 (irreversible, external impact)', () => {
    expect(ejecutarComando.riskLevel).toBe(3);
  });

  it('rejects a command not in the whitelist without running anything', async () => {
    const result = await ejecutarComando.execute(
      { command: 'rm', args: ['-rf', '/'] },
      { conversationId: 'c1' }
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('no está permitido');
  });

  it('accepts a whitelisted command', async () => {
    const result = await ejecutarComando.execute(
      { command: 'git_status', args: [] },
      { conversationId: 'c1' }
    );
    expect(result.success).toBe(true);
  });
});
