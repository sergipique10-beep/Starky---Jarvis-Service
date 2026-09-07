import type { ToolDefinition } from '../types';

interface GithubRepo {
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  pushed_at: string;
  html_url: string;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function fetchAllRepos(token: string): Promise<GithubRepo[]> {
  const repos: GithubRepo[] = [];
  let page = 1;
  for (;;) {
    const response = await fetch(
      `https://api.github.com/user/repos?per_page=100&page=${page}&affiliation=owner`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    const batch = (await response.json()) as GithubRepo[];
    repos.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return repos;
}

export const consultarRepoGithub: ToolDefinition = {
  name: 'consultar_repos_github',
  description: 'Busca un repositorio de GitHub del usuario por nombre y devuelve su descripción y último push.',
  riskLevel: 1,
  inputSchema: {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  },
  async execute(input, _ctx) {
    const { name } = input as { name: string };
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return { success: false, message: 'GITHUB_TOKEN no está configurado.' };
    }

    const repos = await fetchAllRepos(token);
    const needle = normalize(name);
    const match = repos.find(
      (repo) => normalize(repo.name).includes(needle) || normalize(repo.full_name).includes(needle)
    );

    if (!match) {
      return { success: false, message: `No se encontró ningún repositorio de GitHub que coincida con "${name}".` };
    }

    return {
      success: true,
      message: 'Repositorio encontrado.',
      data: {
        name: match.name,
        description: match.description,
        private: match.private,
        pushedAt: match.pushed_at,
        url: match.html_url,
      },
    };
  },
};
