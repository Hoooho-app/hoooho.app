import { FAMILY_WORKSPACE_PATH } from '../../../shared/family-workspace.mjs'

export class FamilyApiError extends Error { constructor(message: string, public status: number) { super(message) } }
export async function api<T>(route: string, input?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${FAMILY_WORKSPACE_PATH}/api${route}`, { method: input === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', headers: input === undefined ? undefined : { 'Content-Type': 'application/json', 'X-Hoooho-Family': '1' }, body: input === undefined ? undefined : JSON.stringify(input), signal })
  const body = await response.json()
  if (!response.ok) throw new FamilyApiError(body.error?.message || '操作未完成，请稍后再试。', response.status)
  return body as T
}
export const messageOf = (error: unknown) => error instanceof Error ? error.message : '连接暂时不可用，请稍后再试。'
