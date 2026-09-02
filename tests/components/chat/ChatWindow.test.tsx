import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatWindow from '@/components/chat/ChatWindow';

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    json: async () => ({ type: 'message', text: 'Hola, soy Jarvis.' }),
  }) as any;
});

describe('ChatWindow', () => {
  it('sends the typed message and renders the assistant reply', async () => {
    render(<ChatWindow conversationId="c1" />);

    fireEvent.change(screen.getByPlaceholderText('Escribile a Jarvis...'), {
      target: { value: 'hola' },
    });
    fireEvent.click(screen.getByText('Enviar'));

    await waitFor(() => expect(screen.getByText('Hola, soy Jarvis.')).toBeTruthy());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('shows a confirmation banner when the API asks for confirmation', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({
        type: 'confirmation_required',
        pendingId: 'p1',
        toolName: 'enviar_mail',
        summary: '¿Confirmás enviar el mail?',
      }),
    });

    render(<ChatWindow conversationId="c1" />);
    fireEvent.change(screen.getByPlaceholderText('Escribile a Jarvis...'), {
      target: { value: 'mandale un mail a juan' },
    });
    fireEvent.click(screen.getByText('Enviar'));

    await waitFor(() => expect(screen.getByText('¿Confirmás enviar el mail?')).toBeTruthy());
    expect(screen.getByText('Confirmar')).toBeTruthy();
    expect(screen.getByText('Cancelar')).toBeTruthy();
  });
});
