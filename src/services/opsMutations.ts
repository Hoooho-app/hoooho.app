import { apiRequest } from './apiClient'
import type { OpsResource } from './ops'

export interface CreateOpsResourceInput {
  name: string
  category: string
  criticality: 'P0' | 'P1' | 'P2'
  impact: string
}

export const createOpsResource = (token: string, body: CreateOpsResourceInput) =>
  apiRequest<OpsResource>('/api/ops/resources', { token, method: 'POST', body })
