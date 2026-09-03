export interface WpScanVulnerability {
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  component: string;
}

export interface WpScanPlugin {
  name: string;
  version: string | null;
}

export interface WpScanResult {
  wpVersion: string | null;
  vulnerabilities: WpScanVulnerability[];
  plugins: WpScanPlugin[];
}

async function execFileAsync(
  command: string,
  args: string[],
  options: any
): Promise<{ stdout: string; stderr: string }> {
  const { execFile } = await import('node:child_process');
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout: stdout as string, stderr: stderr as string });
    });
  });
}

export async function scanSecurity(url: string): Promise<WpScanResult> {
  const apiToken = process.env.WPSCAN_API_TOKEN;
  if (!apiToken) throw new Error('Missing WPSCAN_API_TOKEN');

  const { stdout } = await execFileAsync(
    'wpscan',
    ['--url', url, '--api-token', apiToken, '--format', 'json', '--random-user-agent', '--no-banner'],
    { maxBuffer: 20 * 1024 * 1024 }
  );

  const raw = JSON.parse(stdout);
  const plugins: WpScanPlugin[] = Object.entries(raw.plugins ?? {}).map(([name, info]: [string, any]) => ({
    name,
    version: info.version?.number ?? null,
  }));

  const vulnerabilities: WpScanVulnerability[] = [];
  for (const [pluginName, info] of Object.entries(raw.plugins ?? {}) as [string, any][]) {
    for (const vuln of info.vulnerabilities ?? []) {
      vulnerabilities.push({ title: vuln.title, severity: vuln.severity, component: pluginName });
    }
  }

  return {
    wpVersion: raw.version?.number ?? null,
    vulnerabilities,
    plugins,
  };
}
