import { describe, it, expect } from 'vitest';
import { TOOLS, getTool, getRiskLevel } from '@/lib/tools/registry';
import type { ToolDefinition } from '@/lib/tools/types';

describe('tool registry', () => {
  it('registers a fake tool and finds it by name', () => {
    const fake: ToolDefinition = {
      name: 'fake_tool',
      description: 'test tool',
      riskLevel: 2,
      inputSchema: {},
      execute: async () => ({ success: true, message: 'ok' }),
    };
    TOOLS.push(fake);

    expect(getTool('fake_tool')).toBe(fake);
    expect(getRiskLevel('fake_tool')).toBe(2);
  });

  it('throws when asking the risk level of an unknown tool', () => {
    expect(() => getRiskLevel('does_not_exist')).toThrow();
  });
});
