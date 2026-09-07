import type { ToolDefinition, RiskLevel } from './types';
import { consultarEstadoProyecto } from './catalog/consultarEstadoProyecto';
import { consultarRepoGithub } from './catalog/consultarRepoGithub';
import { crearRecordatorio } from './catalog/crearRecordatorio';
import { enviarMail } from './catalog/enviarMail';
import { ejecutarComando } from './catalog/ejecutarComando';

export const TOOLS: ToolDefinition[] = [
  consultarEstadoProyecto,
  consultarRepoGithub,
  crearRecordatorio,
  enviarMail,
  ejecutarComando,
];

export function getTool(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}

export function getRiskLevel(name: string): RiskLevel {
  const tool = getTool(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.riskLevel;
}
