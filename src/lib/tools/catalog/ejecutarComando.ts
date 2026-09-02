import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ToolDefinition } from '../types';

const execFileAsync = promisify(execFile);

// Fixed whitelist: key = name exposed to the model, value = real binary + fixed args.
// Never interpolate user-provided text into the command itself, only into `args`
// for entries explicitly designed to accept them (none do yet in the MVP).
const COMMAND_WHITELIST: Record<string, { bin: string; fixedArgs: string[] }> = {
  git_status: { bin: 'git', fixedArgs: ['status', '--short'] },
};

export const ejecutarComando: ToolDefinition = {
  name: 'ejecutar_comando',
  description: 'Ejecuta un comando de una lista fija y permitida. Nunca ejecuta texto libre.',
  riskLevel: 3,
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', enum: Object.keys(COMMAND_WHITELIST) },
      args: { type: 'array', items: { type: 'string' } },
    },
    required: ['command'],
  },
  async execute(input, _ctx) {
    const { command } = input as { command: string; args?: string[] };
    const entry = COMMAND_WHITELIST[command];
    if (!entry) {
      return { success: false, message: `El comando "${command}" no está permitido.` };
    }
    try {
      const { stdout } = await execFileAsync(entry.bin, entry.fixedArgs);
      return { success: true, message: 'Comando ejecutado.', data: stdout };
    } catch (err) {
      return { success: false, message: `Falló la ejecución: ${(err as Error).message}` };
    }
  },
};
