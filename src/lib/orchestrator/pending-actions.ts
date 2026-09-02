import { randomUUID } from 'node:crypto';

export interface PendingAction {
  id: string;
  conversationId: string;
  toolName: string;
  input: unknown;
  toolUseId: string;
}

const store = new Map<string, PendingAction>();

export function createPendingAction(conversationId: string, toolName: string, input: unknown, toolUseId: string): PendingAction {
  const action: PendingAction = { id: randomUUID(), conversationId, toolName, input, toolUseId };
  store.set(action.id, action);
  return action;
}

export function getPendingAction(id: string): PendingAction | undefined {
  return store.get(id);
}

export function removePendingAction(id: string): void {
  store.delete(id);
}
