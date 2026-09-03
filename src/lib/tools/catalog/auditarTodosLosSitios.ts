import type { ToolDefinition } from '../types';
import { listRecentProjects } from '@/lib/memory/projects';
import { auditarSitioWordpress } from './auditarSitioWordpress';

export const auditarTodosLosSitios: ToolDefinition = {
  name: 'auditar_todos_los_sitios',
  description: 'Audita todos los sitios WordPress registrados y genera un PDF por cada uno.',
  riskLevel: 1,
  inputSchema: { type: 'object', properties: {} },
  async execute(_input, ctx) {
    const projects = await listRecentProjects(50);
    const pdfPaths: string[] = [];
    const failures: string[] = [];

    for (const project of projects) {
      try {
        const result = await auditarSitioWordpress.execute({ sitio: project.name }, ctx);
        if (result.success) {
          pdfPaths.push((result.data as { pdfPath: string }).pdfPath);
        } else {
          failures.push(`${project.name}: ${result.message}`);
        }
      } catch (err) {
        // A thrown exception (e.g. Puppeteer/PDF generation failure, GCM auth failure while
        // decrypting credentials, or a Supabase error from getProject) must not abort the
        // rest of the batch — record it as a failure and keep going.
        const message = err instanceof Error ? err.message : String(err);
        failures.push(`${project.name}: ${message}`);
      }
    }

    const summary =
      failures.length === 0
        ? `Auditoría completa: ${projects.length} sitios, todos exitosos.`
        : `Auditoría completa: ${projects.length} sitios, ${failures.length} falló(aron) (${failures.join('; ')}).`;

    return { success: true, message: summary, data: { pdfPaths } };
  },
};
