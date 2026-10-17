import { apiRequest } from '../../services/apiClient'
import type { ReviewSources } from '../../pages/RecentReview/reviewModel'

export interface ReviewSnapshotData { version: 1; timeZone: 'Asia/Shanghai'; memberName: string; capturedAt: string; sources: ReviewSources }
export interface ReviewSnapshot { id: string; memberId: string; start: string; end: string; createdAt: string; data: ReviewSnapshotData; voucherConsumed?: boolean }
export interface ReviewVoucher { id: string; status: string }
const root = '/api/care-journey'
export const reviewSnapshotService = {
  async list(token: string, signal?: AbortSignal): Promise<ReviewSnapshot[]> {
    const data = await apiRequest<ReviewSnapshot[] | { snapshots: ReviewSnapshot[] }>(`${root}/review-snapshots`, { token, signal })
    return Array.isArray(data) ? data : data.snapshots
  },
  get(id: string, token: string, signal?: AbortSignal) { return apiRequest<ReviewSnapshot>(`${root}/review-snapshots/${encodeURIComponent(id)}`, { token, signal }) },
  create(input: { memberId: string; start: string; end: string; voucherId?: string; requestId: string }, token: string) { return apiRequest<ReviewSnapshot>(`${root}/review-snapshots`, { token, method: 'POST', body: input }) },
}
