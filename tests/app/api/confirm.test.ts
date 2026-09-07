import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/orchestrator', () => ({
  handleConfirmation: vi.fn().mockResolvedValue({ type: 'message', text: 'listo' }),
}));

import { POST } from '@/app/api/confirm/route';

describe('POST /api/confirm', () => {
  it('calls the orchestrator confirmation handler and returns its response as JSON', async () => {
    const request = new Request('http://localhost/api/confirm', {
      method: 'POST',
      body: JSON.stringify({ pendingId: 'p1', confirmed: true }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(body).toEqual({ type: 'message', text: 'listo' });
  });

  it('returns a JSON error message instead of an empty body when the orchestrator throws', async () => {
    const { handleConfirmation } = await import('@/lib/orchestrator');
    vi.mocked(handleConfirmation).mockRejectedValueOnce(new Error('boom'));

    const request = new Request('http://localhost/api/confirm', {
      method: 'POST',
      body: JSON.stringify({ pendingId: 'p1', confirmed: true }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.type).toBe('message');
    expect(typeof body.text).toBe('string');
    expect(body.text.length).toBeGreaterThan(0);
  });
});
