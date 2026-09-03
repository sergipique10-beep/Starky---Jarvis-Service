import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DynamicForm from '@/components/panel/DynamicForm';

const reminderSchema = {
  type: 'object' as const,
  properties: {
    text: { type: 'string' },
    due_at: { type: 'string', format: 'date-time' },
  },
  required: ['text'],
};

const commandSchema = {
  type: 'object' as const,
  properties: {
    command: { type: 'string', enum: ['git_status'] },
  },
  required: ['command'],
};

describe('DynamicForm', () => {
  it('renders a text input for a plain string field and a datetime-local input for a date-time field', () => {
    render(<DynamicForm schema={reminderSchema} onSubmit={vi.fn()} submitLabel="Ejecutar" />);

    expect(screen.getByLabelText('text')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('due_at')).toHaveAttribute('type', 'datetime-local');
  });

  it('renders a select with the schema enum options', () => {
    render(<DynamicForm schema={commandSchema} onSubmit={vi.fn()} submitLabel="Ejecutar" />);

    const select = screen.getByLabelText('command') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['', 'git_status']);
  });

  it('calls onSubmit with the filled values, omitting empty optional fields', () => {
    const onSubmit = vi.fn();
    render(<DynamicForm schema={reminderSchema} onSubmit={onSubmit} submitLabel="Ejecutar" />);

    fireEvent.change(screen.getByLabelText('text'), { target: { value: 'llamar al contador' } });
    fireEvent.click(screen.getByText('Ejecutar'));

    expect(onSubmit).toHaveBeenCalledWith({ text: 'llamar al contador' });
  });

  it('does not call onSubmit and shows a validation message when a required field is empty', () => {
    const onSubmit = vi.fn();
    render(<DynamicForm schema={reminderSchema} onSubmit={onSubmit} submitLabel="Ejecutar" />);

    fireEvent.click(screen.getByText('Ejecutar'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Este campo es obligatorio')).toBeTruthy();
  });
});
