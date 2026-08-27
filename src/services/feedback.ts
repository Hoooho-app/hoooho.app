import { apiRequest } from './apiClient'

export type FeedbackCategory = '不好用' | '出现错误' | '内容有误' | '希望新增' | '隐私与数据' | '其他'
export type FeedbackStatus = 'received' | 'viewed' | 'evaluating' | 'improving' | 'resolved' | 'merged' | 'declined'
export type FeedbackPriority = 'low' | 'normal' | 'high' | 'urgent'
export interface FeedbackAttachmentInput { name: string; type: string; dataUrl: string }
export interface FeedbackAttachment { id: string; messageId: string | null; name: string; type: string; size: number; createdAt: string; url: string }
export interface FeedbackMessage { id: string; feedbackId: string; authorAccountId: string; kind: 'user-supplement' | 'user-reply' | 'internal-note'; text: string; createdAt: string }
export interface FeedbackHistory { id: string; feedbackId: string; status: FeedbackStatus; createdAt: string }
export interface FeedbackRecord {
  id: string; category: FeedbackCategory; description: string; summary: string; sourcePath: string | null; sourceName: string | null;
  appVersion: string | null; status: FeedbackStatus; handledVersion: string | null; noActionReason: string | null; mergedIntoId: string | null;
  createdAt: string; updatedAt: string; latestReply: string | null; attachmentCount: number;
  attachments?: FeedbackAttachment[]; messages?: FeedbackMessage[]; statusHistory?: FeedbackHistory[]
}
export interface FeedbackInput {
  category: FeedbackCategory; description: string; sourcePath: string; sourceName: string; appVersion: string; idempotencyKey: string;
  device: { type: string; os: string; browser: string; screen: string }; attachments: FeedbackAttachmentInput[]
}
export interface OpsFeedbackRecord extends Omit<FeedbackRecord, 'messages'> {
  accountId: string; priority: FeedbackPriority; device: { type: string; os: string | null; browser: string | null; screen: string | null };
  supplementCount: number; mergedCount: number; messages?: FeedbackMessage[]
}
export interface OpsFeedbackOverview { new: number; pendingView: number; viewed: number; evaluating: number; improving: number; resolved: number; duplicates: number; withSupplements: number; averageFirstViewMs: number | null }

export const feedbackStatusLabels: Record<FeedbackStatus, string> = { received: '已收到', viewed: '已查看', evaluating: '评估中', improving: '改进中', resolved: '已处理', merged: '已合并', declined: '暂不处理' }
export const feedbackCategories: FeedbackCategory[] = ['不好用', '出现错误', '内容有误', '希望新增', '隐私与数据', '其他']

export const submitFeedback = (token: string, input: FeedbackInput) => apiRequest<{ id: string; status: FeedbackStatus; createdAt: string; duplicate?: boolean }>('/api/feedback', { token, method: 'POST', body: input })
export const listMyFeedback = (token: string, signal?: AbortSignal) => apiRequest<FeedbackRecord[]>('/api/feedback', { token, signal })
export const getMyFeedback = (token: string, id: string, signal?: AbortSignal) => apiRequest<FeedbackRecord>(`/api/feedback/${encodeURIComponent(id)}`, { token, signal })
export const addFeedbackMessage = (token: string, id: string, input: { text: string; attachments: FeedbackAttachmentInput[] }) => apiRequest<FeedbackRecord>(`/api/feedback/${encodeURIComponent(id)}/messages`, { token, method: 'POST', body: input })

export const listOpsFeedback = (token: string, params: URLSearchParams, signal?: AbortSignal) => apiRequest<{ overview: OpsFeedbackOverview; feedback: OpsFeedbackRecord[] }>(`/api/ops/feedback?${params}`, { token, signal })
export const getOpsFeedback = (token: string, id: string, signal?: AbortSignal) => apiRequest<OpsFeedbackRecord>(`/api/ops/feedback/${encodeURIComponent(id)}`, { token, signal })
export const updateOpsFeedback = (token: string, id: string, input: Partial<Pick<OpsFeedbackRecord, 'status' | 'priority' | 'handledVersion' | 'noActionReason' | 'mergedIntoId'>>) => apiRequest<OpsFeedbackRecord>(`/api/ops/feedback/${encodeURIComponent(id)}`, { token, method: 'PATCH', body: input })
export const addOpsFeedbackMessage = (token: string, id: string, input: { kind: 'internal-note' | 'user-reply'; text: string }) => apiRequest<OpsFeedbackRecord>(`/api/ops/feedback/${encodeURIComponent(id)}/messages`, { token, method: 'POST', body: input })
