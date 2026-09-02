import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/orchestrator', () => ({
  handleUserMessage: vi.fn().mockResolvedValue({ type: 'message', text: 'hola!' }),
}));

import { POST } from '@/app/api/chat/route';

describe('POST /api/chat', () => {
  it('calls the orchestrator and returns its response as JSON', async () => {
    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ conversationId: 'c1', text: 'hola' }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(body).toEqual({ type: 'message', text: 'hola!' });
  });
});
