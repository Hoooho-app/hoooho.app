import { opsApiRequest } from './opsAuth'

export type OpsStatus = 'normal'|'warning'|'critical'|'unknown'|'disabled'
export type OpsSource = 'api'|'manual'|'mixed'
export interface OpsResource {
  id:string; name:string; category:string; criticality:'P0'|'P1'|'P2'; source:OpsSource; status:OpsStatus; plan:string; monthlyCost:number|null;
  billingPeriod:string; balance:string; usage:string; usageLimit:string; renewalDate:string; expirationDate:string; autoRenew:boolean|null;
  monthlyBudget:number|null; alertThreshold:number; notes:string; nextAction:string; impact:string; runway:string; enabled:boolean;
  lastSyncAt:string|null; lastSuccessfulSyncAt:string|null; syncStatus:'normal'|'failed'|'not-configured'|'stale'; updatedAt:string
}
export type OpsAccessMode = 'owner'
export const getOpsResources = (token:string, signal?:AbortSignal) => opsApiRequest<{resources:OpsResource[];accessMode:OpsAccessMode}>('/api/ops/resources',{token,signal})
export const updateOpsResource = (token:string,id:string,body:Partial<OpsResource>) => opsApiRequest<OpsResource>(`/api/ops/resources/${encodeURIComponent(id)}`,{token,method:'PATCH',body})
export const syncOpsResources = (token:string) => opsApiRequest<{resources:OpsResource[]}>('/api/ops/sync',{token,method:'POST'})
