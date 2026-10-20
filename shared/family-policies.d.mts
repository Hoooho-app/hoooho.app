export type PolicyModuleId = 'finances' | 'assets' | 'legal' | 'schedule' | 'home' | 'health' | 'education' | 'safety' | 'governance'
export type PolicyStatus = 'draft' | 'trial' | 'agreed'
export type PolicyFrequency = 'event' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
export type PolicyDocument = {
  title: string; purpose: string; status: PolicyStatus; principles: string[]
  sections: { title: string; items: string[] }[]
  flow: Record<'capture' | 'check' | 'decision' | 'routine' | 'discuss' | 'execute' | 'review', string>
  exception: string
  responsibilities: { task: string; owner: string; backup: string; frequency: PolicyFrequency; standard: string }[]
  pending: string[]
}
export type PolicyRecord = { moduleId: PolicyModuleId; revision: number; updatedAt: number | null; updatedBy: string; document: PolicyDocument }
export const defaultPolicies: Record<PolicyModuleId, PolicyDocument>
export const policyModuleIds: PolicyModuleId[]
export const policyStatuses: Record<PolicyStatus, string>
export const policyFrequencies: Record<PolicyFrequency, string>
export function initialPolicy(moduleId: PolicyModuleId): PolicyRecord
