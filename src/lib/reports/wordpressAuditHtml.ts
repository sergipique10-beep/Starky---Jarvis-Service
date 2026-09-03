import type { WordpressAuditReport } from './wordpressAuditAggregator';

// Several values interpolated below (plugin names/versions, vulnerability titles, WP version,
// and section `reason` strings) can originate from the audited third-party WordPress site via
// WPScan/WP-CLI, not from a trusted operator. Since this HTML is fed into a real headless
// Chromium via page.setContent(), an adversarial site could otherwise inject <script> or other
// markup that executes during PDF generation. Escape every dynamic value before interpolation.
function escapeHtml(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderSection(title: string, bodyHtml: string, unavailableReason?: string): string {
  if (unavailableReason) {
    return `<section><h2>${escapeHtml(title)}</h2><p class="unavailable">Sección no disponible: ${escapeHtml(unavailableReason)}</p></section>`;
  }
  return `<section><h2>${escapeHtml(title)}</h2>${bodyHtml}</section>`;
}

export function renderAuditReportHtml(report: WordpressAuditReport): string {
  const performanceHtml = report.performance.available
    ? `<p>Score de rendimiento (mobile): <strong>${report.performance.data.performanceScore}/100</strong></p>
       <p>LCP: ${report.performance.data.lcpMs}ms — CLS: ${report.performance.data.cls}</p>`
    : '';

  const securityHtml = report.security.available
    ? `<p>Versión de WordPress: ${escapeHtml(report.security.data.wpVersion ?? 'desconocida')}</p>
       <ul>${report.security.data.vulnerabilities
         .map((v) => `<li>[${escapeHtml(v.severity.toUpperCase())}] ${escapeHtml(v.title)} (${escapeHtml(v.component)})</li>`)
         .join('')}</ul>`
    : '';

  const pluginsHtml = report.plugins.available
    ? `<ul>${report.plugins.data.external
        .map((p) => `<li>${escapeHtml(p.name)} — v${escapeHtml(p.version ?? '?')}</li>`)
        .join('')}</ul>`
    : '';

  const databaseHtml = report.database.available
    ? `<p>Tamaño de la base de datos: ${report.database.data.sizeMb} MB</p>
       <ul>${report.database.data.largestTables
         .map((t) => `<li>${escapeHtml(t.name)}: ${t.sizeMb} MB</li>`)
         .join('')}</ul>`
    : '';

  return `
    <html>
      <head><meta charset="utf-8" /></head>
      <body>
        <h1>Auditoría de ${escapeHtml(report.siteName)}</h1>
        <p>${escapeHtml(report.url)} — generado el ${report.generatedAt}</p>
        ${renderSection('Rendimiento', performanceHtml, report.performance.available ? undefined : report.performance.reason)}
        ${renderSection('Seguridad', securityHtml, report.security.available ? undefined : report.security.reason)}
        ${renderSection('Plugins', pluginsHtml, report.plugins.available ? undefined : report.plugins.reason)}
        ${renderSection('Base de datos', databaseHtml, report.database.available ? undefined : report.database.reason)}
      </body>
    </html>
  `;
}
