export type RiskLevel = 1 | 2 | 3;

export interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface ToolContext {
  conversationId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  riskLevel: RiskLevel;
  inputSchema: object;
  execute(input: unknown, ctx: ToolContext): Promise<ToolResult>;
}
