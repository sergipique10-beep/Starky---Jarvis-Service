import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolDefinition } from '../types';
import { getProject } from '@/lib/memory/projects';
import { buildAuditReport } from '@/lib/reports/wordpressAuditAggregator';
import { renderAuditReportHtml } from '@/lib/reports/wordpressAuditHtml';
import { generatePdf } from '@/lib/reports/pdfGenerator';

export const auditarSitioWordpress: ToolDefinition = {
  name: 'auditar_sitio_wordpress',
  description:
    'Audita un sitio WordPress registrado (rendimiento, seguridad, plugins, base de datos) y genera un PDF con el resultado.',
  riskLevel: 1,
  inputSchema: {
    type: 'object',
    properties: { sitio: { type: 'string' } },
    required: ['sitio'],
  },
  async execute(input, _ctx) {
    const { sitio } = input as { sitio: string };
    const project = await getProject(sitio);
    if (!project) {
      return { success: false, message: `No se encontró el sitio "${sitio}" registrado.` };
    }
    if (!project.description) {
      return { success: false, message: `El sitio "${sitio}" no tiene una URL registrada.` };
    }

    const report = await buildAuditReport(sitio, project.description);
    const html = renderAuditReportHtml(report);
    const outputPath = join(tmpdir(), `auditoria-${sitio}-${Date.now()}.pdf`);
    await generatePdf(html, outputPath);

    const perfSummary = report.performance.available
      ? `score de performance ${report.performance.data.performanceScore}/100`
      : 'performance no disponible';
    const securitySummary = report.security.available
      ? `${report.security.data.vulnerabilities.length} vulnerabilidad(es) encontrada(s)`
      : 'seguridad no disponible';

    return {
      success: true,
      message: `Auditoría de ${sitio} completa: ${perfSummary}, ${securitySummary}.`,
      data: { pdfPath: outputPath, report },
    };
  },
};
