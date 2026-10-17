import type { Plugin } from 'vite'
export function familySharingApiPlugin(options?: Record<string, unknown>): Plugin
export function familySharingRoute(pathname: string): Record<string, string> | null
export function familySharingResult(service: unknown, accountId: string, route: Record<string, string>, method: string, input?: unknown): Promise<unknown>
export const FAMILY_SHARING_BODY_LIMIT: number
