export interface AnalyticsPage { id: string; name: string; available: boolean }
export interface AnalyticsOperation { id: string; name: string; method: string; pattern: RegExp }
export const ANALYTICS_SCHEMA: number
export const ANALYTICS_CHOICES: Readonly<Record<string, string>>
export const ANALYTICS_RETENTION_DAYS: number
export const ANALYTICS_KINDS: string[]
export const ANALYTICS_OPERATIONS: AnalyticsOperation[]
export function analyticsPages(): AnalyticsPage[]
export function analyticsPage(path: string): AnalyticsPage | null
export function analyticsOperation(path: string, method?: string, action?: string): AnalyticsOperation | null
