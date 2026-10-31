export const BILLING_CATEGORIES: readonly { id: string; name: string }[]
export const BILLING_MODES: readonly { id: string; name: string }[]
export const BILLING_FIELDS: Readonly<Record<string, { label: string; kind: 'money' | 'date' | 'quantity' | 'text' | 'boolean' }>>
export function isBillingCategory(id: unknown): boolean
export function isBillingMode(id: unknown): boolean
export interface BillingDefinition { connectable: boolean; category: string; categoryName: string; modes: string[]; modeNames: string[]; fields: string[]; accountScope: boolean }
export function billingDefinition(source: { id: string; category?: string; billingModes?: string[] }, connectedFields?: string[]): BillingDefinition
