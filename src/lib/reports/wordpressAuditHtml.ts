import type { WordpressAuditReport } from './wordpressAuditAggregator';

function renderSection(title: string, bodyHtml: string, unavailableReason?: string): string {
  if (unavailableReason) {
    return `<section><h2>${title}</h2><p class="unavailable">Sección no disponible: ${unavailableReason}</p></section>`;
  }
  return `<section><h2>${title}</h2>${bodyHtml}</section>`;
}

export function renderAuditReportHtml(report: WordpressAuditReport): string {
  const performanceHtml = report.performance.available
    ? `<p>Score de rendimiento (mobile): <strong>${report.performance.data.performanceScore}/100</strong></p>
       <p>LCP: ${report.performance.data.lcpMs}ms — CLS: ${report.performance.data.cls}</p>`
    : '';

  const securityHtml = report.security.available
    ? `<p>Versión de WordPress: ${report.security.data.wpVersion ?? 'desconocida'}</p>
       <ul>${report.security.data.vulnerabilities
         .map((v) => `<li>[${v.severity.toUpperCase()}] ${v.title} (${v.component})</li>`)
         .join('')}</ul>`
    : '';

  const pluginsHtml = report.plugins.available
    ? `<ul>${report.plugins.data.external
        .map((p) => `<li>${p.name} — v${p.version ?? '?'}</li>`)
        .join('')}</ul>`
    : '';

  const databaseHtml = report.database.available
    ? `<p>Tamaño de la base de datos: ${report.database.data.sizeMb} MB</p>
       <ul>${report.database.data.largestTables
         .map((t) => `<li>${t.name}: ${t.sizeMb} MB</li>`)
         .join('')}</ul>`
    : '';

  return `
    <html>
      <head><meta charset="utf-8" /></head>
      <body>
        <h1>Auditoría de ${report.siteName}</h1>
        <p>${report.url} — generado el ${report.generatedAt}</p>
        ${renderSection('Rendimiento', performanceHtml, report.performance.available ? undefined : report.performance.reason)}
        ${renderSection('Seguridad', securityHtml, report.security.available ? undefined : report.security.reason)}
        ${renderSection('Plugins', pluginsHtml, report.plugins.available ? undefined : report.plugins.reason)}
        ${renderSection('Base de datos', databaseHtml, report.database.available ? undefined : report.database.reason)}
      </body>
    </html>
  `;
}
