import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AuditLogList from '@/components/panel/AuditLogList';

describe('AuditLogList', () => {
  it('renders one row per audit log entry with the tool name and result message', () => {
    render(
      <AuditLogList
        rows={[
          {
            id: '1',
            tool_name: 'crear_recordatorio',
            risk_level: 2,
            input: {},
            result: { success: true, message: 'Listo, agendé el recordatorio.' },
            created_at: '2026-09-03T10:00:00Z',
          },
        ]}
      />
    );

    expect(screen.getByText('crear_recordatorio')).toBeTruthy();
    expect(screen.getByText('Listo, agendé el recordatorio.')).toBeTruthy();
  });

  it('renders a placeholder when there is no history yet', () => {
    render(<AuditLogList rows={[]} />);

    expect(screen.getByText('Todavía no se ejecutó ninguna acción.')).toBeTruthy();
  });
});
