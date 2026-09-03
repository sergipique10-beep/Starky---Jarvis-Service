import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PanelClient from '@/components/panel/PanelClient';

const crearRecordatorioTool = {
  name: 'crear_recordatorio',
  description: 'Crea un recordatorio.',
  riskLevel: 2 as const,
  inputSchema: { type: 'object' as const, properties: { text: { type: 'string' } }, required: ['text'] },
};

const enviarMailTool = {
  name: 'enviar_mail',
  description: 'Envía un mail.',
  riskLevel: 3 as const,
  inputSchema: {
    type: 'object' as const,
    properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } },
    required: ['to', 'subject', 'body'],
  },
};

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('PanelClient', () => {
  it('executes a risk-level-2 macro directly and shows the result', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ type: 'message', text: 'Listo, agendé el recordatorio.' }),
    });

    render(<PanelClient tools={[crearRecordatorioTool]} initialAuditLog={[]} />);

    fireEvent.change(screen.getByLabelText('text'), { target: { value: 'regar las plantas' } });
    fireEvent.click(screen.getByText('Ejecutar'));

    await waitFor(() => expect(screen.getByText('Listo, agendé el recordatorio.')).toBeTruthy());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/tools/execute',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ toolName: 'crear_recordatorio', input: { text: 'regar las plantas' } }),
      })
    );
  });

  it('shows a confirmation review for a risk-level-3 macro and only executes it after confirming', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        type: 'confirmation_required',
        pendingId: 'p1',
        toolName: 'enviar_mail',
        summary: '¿Confirmás enviar el mail?',
      }),
    });

    render(<PanelClient tools={[enviarMailTool]} initialAuditLog={[]} />);

    fireEvent.change(screen.getByLabelText('to'), { target: { value: 'juan@mail.com' } });
    fireEvent.change(screen.getByLabelText('subject'), { target: { value: 'Hola' } });
    fireEvent.change(screen.getByLabelText('body'), { target: { value: 'Test' } });
    fireEvent.click(screen.getByText('Ejecutar'));

    await waitFor(() => expect(screen.getByText('¿Confirmás enviar el mail?')).toBeTruthy());

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ type: 'message', text: 'Mail enviado a juan@mail.com.' }),
    });

    fireEvent.click(screen.getByText('Confirmar'));

    await waitFor(() => expect(screen.getByText('Mail enviado a juan@mail.com.')).toBeTruthy());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/confirm',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ pendingId: 'p1', confirmed: true }) })
    );
  });

  it('shows an error message instead of silently doing nothing when the execute request is not ok', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'No autorizado.' }),
    });

    render(<PanelClient tools={[crearRecordatorioTool]} initialAuditLog={[]} />);

    fireEvent.change(screen.getByLabelText('text'), { target: { value: 'regar las plantas' } });
    fireEvent.click(screen.getByText('Ejecutar'));

    await waitFor(() => expect(screen.getByText('No autorizado.')).toBeTruthy());
  });
});
