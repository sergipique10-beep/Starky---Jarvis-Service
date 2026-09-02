import type { ToolDefinition } from '../types';
import { getSupabaseClient } from '@/lib/supabase/client';

export const crearRecordatorio: ToolDefinition = {
  name: 'crear_recordatorio',
  description: 'Crea un recordatorio para el usuario en una fecha dada.',
  riskLevel: 2,
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      due_at: { type: 'string', format: 'date-time' },
    },
    required: ['text'],
  },
  async execute(input, _ctx) {
    const { text, due_at } = input as { text: string; due_at?: string };
    const client = getSupabaseClient();
    const { error } = await client.from('reminders').insert({ text, due_at: due_at ?? null });
    if (error) {
      return { success: false, message: `No pude crear el recordatorio: ${error.message}` };
    }
    return { success: true, message: `Listo, agendé el recordatorio: "${text}".` };
  },
};
