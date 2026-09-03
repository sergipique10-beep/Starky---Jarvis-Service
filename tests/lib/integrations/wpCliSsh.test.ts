import { describe, it, expect, vi } from 'vitest';

const mockExecCommand = vi.fn();
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockDispose = vi.fn();

vi.mock('node-ssh', () => ({
  NodeSSH: vi.fn().mockImplementation(function () {
    return {
      connect: mockConnect,
      execCommand: mockExecCommand,
      dispose: mockDispose,
    };
  }),
}));

import { gatherWpCliInventory } from '@/lib/integrations/wpCliSsh';

const creds = { host: 'h', port: 22, username: 'u', privateKey: 'k' };

describe('gatherWpCliInventory', () => {
  it('runs only whitelisted read-only wp-cli commands over SSH and parses their output', async () => {
    mockExecCommand.mockImplementation((cmd: string) => {
      if (cmd === 'wp core version') return Promise.resolve({ stdout: '6.4.2', stderr: '', code: 0 });
      if (cmd.includes('php -v')) return Promise.resolve({ stdout: 'PHP 8.1.10', stderr: '', code: 0 });
      if (cmd === 'wp plugin list --format=json') {
        return Promise.resolve({
          stdout: JSON.stringify([
            { name: 'akismet', version: '5.3', status: 'active' },
            { name: 'old-plugin', version: '1.0', status: 'inactive' },
          ]),
          stderr: '',
          code: 0,
        });
      }
      if (cmd === 'wp db size --size_format=mb --format=json') {
        return Promise.resolve({ stdout: JSON.stringify([{ Name: 'wp', Size: '42' }]), stderr: '', code: 0 });
      }
      if (cmd.startsWith('wp db query')) {
        return Promise.resolve({
          stdout: 'table_name\tsize_mb\nwp_options\t12.50\nwp_old_table\t8.00\n',
          stderr: '',
          code: 0,
        });
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = await gatherWpCliInventory(creds);

    expect(result.wpVersion).toBe('6.4.2');
    expect(result.plugins).toEqual([
      { name: 'akismet', version: '5.3', status: 'active' },
      { name: 'old-plugin', version: '1.0', status: 'inactive' },
    ]);
    expect(result.db.sizeMb).toBe(42);
    expect(result.db.largestTables).toEqual([
      { name: 'wp_options', sizeMb: 12.5 },
      { name: 'wp_old_table', sizeMb: 8 },
    ]);
    expect(mockDispose).toHaveBeenCalled();
  });

  it('always disposes the SSH connection even if a command fails', async () => {
    mockExecCommand.mockRejectedValue(new Error('connection reset'));
    await expect(gatherWpCliInventory(creds)).rejects.toThrow('connection reset');
    expect(mockDispose).toHaveBeenCalled();
  });
});
