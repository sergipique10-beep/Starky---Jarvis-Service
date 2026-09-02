import type { ToolDefinition } from '../types';
import { getProject } from '@/lib/memory/projects';

export const consultarEstadoProyecto: ToolDefinition = {
  name: 'consultar_estado_proyecto',
  description: 'Devuelve el estado, descripción y última actualización de un proyecto del usuario.',
  riskLevel: 1,
  inputSchema: {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  },
  async execute(input, _ctx) {
    const { name } = input as { name: string };
    const project = await getProject(name);
    if (!project) {
      return { success: false, message: `No se encontró el proyecto "${name}".` };
    }
    return { success: true, message: 'Proyecto encontrado.', data: project };
  },
};
