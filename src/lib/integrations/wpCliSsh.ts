import { NodeSSH } from 'node-ssh';
import type { SiteCredentials } from '@/lib/memory/siteCredentials';

// Fixed whitelist of read-only WP-CLI commands. Never accept a caller-supplied
// command string here — only these exact, hardcoded commands ever run over SSH.
const WHITELISTED_COMMANDS = {
  coreVersion: 'wp core version',
  phpVersion: 'php -v',
  pluginList: 'wp plugin list --format=json',
  dbSize: 'wp db size --size_format=mb --format=json',
  largestTables:
    "wp db query \"SELECT table_name, ROUND((data_length + index_length) / 1024 / 1024, 2) AS size_mb FROM information_schema.TABLES WHERE table_schema = DATABASE() ORDER BY size_mb DESC LIMIT 10\"",
} as const;

export interface WpCliDbInfo {
  sizeMb: number;
  largestTables: { name: string; sizeMb: number }[];
}

export interface WpCliPluginStatus {
  name: string;
  version: string;
  status: 'active' | 'inactive';
}

export interface WpCliInventory {
  wpVersion: string;
  phpVersion: string;
  plugins: WpCliPluginStatus[];
  db: WpCliDbInfo;
}

function parseTabSeparatedTable(output: string): { name: string; sizeMb: number }[] {
  const lines = output.trim().split('\n');
  return lines.slice(1).map((line) => {
    const [name, sizeMb] = line.split('\t');
    return { name, sizeMb: parseFloat(sizeMb) };
  });
}

export async function gatherWpCliInventory(creds: SiteCredentials): Promise<WpCliInventory> {
  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: creds.host,
      port: creds.port,
      username: creds.username,
      privateKey: creds.privateKey,
    });

    const coreVersionResult = await ssh.execCommand(WHITELISTED_COMMANDS.coreVersion);
    const phpVersionResult = await ssh.execCommand(WHITELISTED_COMMANDS.phpVersion);
    const pluginListResult = await ssh.execCommand(WHITELISTED_COMMANDS.pluginList);
    const dbSizeResult = await ssh.execCommand(WHITELISTED_COMMANDS.dbSize);
    const largestTablesResult = await ssh.execCommand(WHITELISTED_COMMANDS.largestTables);

    const plugins: WpCliPluginStatus[] = JSON.parse(pluginListResult.stdout);
    const dbSizeRows = JSON.parse(dbSizeResult.stdout) as { Name: string; Size: string }[];
    const sizeMb = parseFloat(dbSizeRows[0]?.Size ?? '0');
    const largestTables = parseTabSeparatedTable(largestTablesResult.stdout);

    return {
      wpVersion: coreVersionResult.stdout.trim(),
      phpVersion: phpVersionResult.stdout.trim(),
      plugins,
      db: { sizeMb, largestTables },
    };
  } finally {
    ssh.dispose();
  }
}
