import { getRecentMessages } from './conversations';
import { getPreferences } from './preferences';
import { listRecentProjects } from './projects';
import type { ClaudeMessage } from '@/lib/claude/client';

export async function buildContext(conversationId: string): Promise<ClaudeMessage[]> {
  const [history, preferences, projects] = await Promise.all([
    getRecentMessages(conversationId, 20),
    getPreferences(),
    listRecentProjects(5),
  ]);

  const summaryMessages = history.filter((m) => m.role === 'summary');
  const turnMessages = history.filter((m) => m.role !== 'summary');

  const preferencesLine = Object.entries(preferences)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  const projectsLine = projects.map((p) => `${p.name} (${p.status}): ${p.description ?? 'sin descripción'}`).join('; ');
  const summaryLine = summaryMessages.map((m) => m.content).join(' ');

  const leadingContent = [
    preferencesLine ? `Preferencias del usuario: ${preferencesLine}.` : '',
    projectsLine ? `Proyectos recientes: ${projectsLine}.` : '',
    summaryLine ? `Resumen de la conversación previa: ${summaryLine}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const leadingContext: ClaudeMessage = {
    role: 'user',
    content: leadingContent || 'Sin contexto previo todavía.',
  };

  const mappedHistory: ClaudeMessage[] = turnMessages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  return [leadingContext, ...mappedHistory];
}
