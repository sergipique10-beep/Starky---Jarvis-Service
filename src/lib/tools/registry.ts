import type { ToolDefinition, RiskLevel } from './types';
import { consultarEstadoProyecto } from './catalog/consultarEstadoProyecto';
import { crearRecordatorio } from './catalog/crearRecordatorio';

export const TOOLS: ToolDefinition[] = [consultarEstadoProyecto, crearRecordatorio];

export function getTool(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}

export function getRiskLevel(name: string): RiskLevel {
  const tool = getTool(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.riskLevel;
}
