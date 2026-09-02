import { opsApiRequest } from './opsAuth'
import type { OpsResource } from './ops'

export interface CreateOpsResourceInput {
  name: string
  category: string
  criticality: 'P0' | 'P1' | 'P2'
  impact: string
}

export const createOpsResource = (token: string, body: CreateOpsResourceInput) =>
  opsApiRequest<OpsResource>('/api/ops/resources', { token, method: 'POST', body })
