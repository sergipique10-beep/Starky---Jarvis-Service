export interface ProjectRecord {
  name: string;
  status: string;
  description: string | null;
}

export async function getProject(_name: string): Promise<ProjectRecord | null> {
  throw new Error('Not implemented yet — see Task 9');
}
