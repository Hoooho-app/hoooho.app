import { apiRequest } from './apiClient'

export type FeedbackCategory = string | null
export type FeedbackProblemPage = '首页' | '健康随记' | '健康档案' | '家人管理' | '登录与账户' | '其他'
export type FeedbackProblemType = 'function_error' | 'display_issue' | 'usability_issue' | 'content_error' | 'performance_issue' | 'login_issue' | 'voice_issue' | 'image_issue' | 'feature_request' | 'experience_suggestion'
export type FeedbackStatus = 'received' | 'reviewing' | 'needs_more_info' | 'planned' | 'in_progress' | 'improved' | 'not_planned' | 'merged'
export type FeedbackPriority = 'low' | 'normal' | 'high' | 'urgent'
export interface FeedbackAttachmentInput { name: string; type: string; dataUrl: string }
export interface FeedbackAttachment { id: string; messageId: string | null; name: string; type: string; size: number; createdAt: string; url: string }
export interface FeedbackMessage { id: string; feedbackId: string; authorAccountId: string; kind: 'user-supplement' | 'user-reply' | 'internal-note'; senderType: 'user' | 'team'; text: string; createdAt: string; readByUserAt: string | null }
export interface FeedbackHistory { id: string; feedbackId: string; status: FeedbackStatus; createdAt: string }
export interface FeedbackRecord {
  id: string; category: FeedbackCategory; problemPage: FeedbackProblemPage | null; problemType: FeedbackProblemType | null; description: string; summary: string; sourcePath: string | null; sourceName: string | null;
  appVersion: string | null; status: FeedbackStatus; handledVersion: string | null; noActionReason: string | null; mergedIntoId: string | null;
  createdAt: string; updatedAt: string; statusUpdatedAt: string; latestReply: string | null; unreadReplyCount: number; attachmentCount: number;
  attachments?: FeedbackAttachment[]; messages?: FeedbackMessage[]; statusHistory?: FeedbackHistory[]
}
export interface FeedbackInput {
  category: FeedbackCategory; problemPage: FeedbackProblemPage | null; problemType: FeedbackProblemType | null; description: string; sourcePath: string; sourceName: string; appVersion: string; idempotencyKey: string;
  device: { type: string; os: string; browser: string; screen: string }; attachments: FeedbackAttachmentInput[]
}
export interface OpsFeedbackRecord extends Omit<FeedbackRecord, 'messages'> {
  accountId: string; priority: FeedbackPriority; device: { type: string; os: string | null; browser: string | null; screen: string | null };
  supplementCount: number; mergedCount: number; lastOpsViewedAt: string | null; hasUnreadSupplement: boolean; messages?: FeedbackMessage[]
}
export interface OpsFeedbackOverview { new: number; pendingView: number; viewed: number; evaluating: number; improving: number; resolved: number; duplicates: number; withSupplements: number; unreadSupplements: number; averageFirstViewMs: number | null }

export const feedbackStatusLabels: Record<FeedbackStatus, string> = { received: '已收到', reviewing: '正在了解', needs_more_info: '等你补充', planned: '已加入计划', in_progress: '正在改进', improved: '已改进', not_planned: '暂不调整', merged: '已合并处理' }
export const feedbackCategoryOptions: { value: FeedbackProblemType; label: string }[] = [
  { value: 'function_error', label: '功能异常' }, { value: 'display_issue', label: '页面显示' }, { value: 'usability_issue', label: '操作不便' }, { value: 'content_error', label: '内容有误' }, { value: 'performance_issue', label: '加载缓慢' },
  { value: 'login_issue', label: '登录问题' }, { value: 'voice_issue', label: '语音问题' }, { value: 'image_issue', label: '图片问题' }, { value: 'feature_request', label: '希望新增' }, { value: 'experience_suggestion', label: '体验建议' }
]
export const feedbackCategories = feedbackCategoryOptions.map((item) => item.label)
export const feedbackProblemTypeLabel = (value: string | null | undefined) => feedbackCategoryOptions.find((item) => item.value === value)?.label ?? value ?? null
export const opsFeedbackCategories = ['不好用', '出现错误', '内容有误', '希望新增', '隐私与数据', '其他'] as const
export const opsFeedbackCategoryLabel = (value: string | null | undefined) => {
  if (['usability_issue', 'experience_suggestion', '不好用'].includes(value ?? '')) return '不好用'
  if (['function_error', 'display_issue', 'performance_issue', 'login_issue', 'voice_issue', 'image_issue', '功能异常', '出现错误'].includes(value ?? '')) return '出现错误'
  if (['content_error', '内容有误'].includes(value ?? '')) return '内容有误'
  if (['feature_request', '希望新增'].includes(value ?? '')) return '希望新增'
  if (value === '隐私与数据') return '隐私与数据'
  return '其他'
}
export const feedbackProblemPages: FeedbackProblemPage[] = ['首页', '健康随记', '健康档案', '家人管理', '登录与账户', '其他']

export const submitFeedback = (token: string, input: FeedbackInput) => apiRequest<{ id: string; status: FeedbackStatus; createdAt: string; duplicate?: boolean }>('/api/feedback', { token, method: 'POST', body: input })
export const listMyFeedback = (token: string, signal?: AbortSignal) => apiRequest<FeedbackRecord[]>('/api/feedback', { token, signal })
export const getMyFeedback = (token: string, id: string, signal?: AbortSignal) => apiRequest<FeedbackRecord>(`/api/feedback/${encodeURIComponent(id)}`, { token, signal })
export const addFeedbackMessage = (token: string, id: string, input: { text: string; attachments: FeedbackAttachmentInput[] }) => apiRequest<FeedbackRecord>(`/api/feedback/${encodeURIComponent(id)}/messages`, { token, method: 'POST', body: input })
export const markFeedbackRead = (token: string, id: string) => apiRequest<FeedbackRecord>(`/api/feedback/${encodeURIComponent(id)}/read`, { token, method: 'POST' })

export const listOpsFeedback = (token: string, params: URLSearchParams, signal?: AbortSignal) => apiRequest<{ overview: OpsFeedbackOverview; feedback: OpsFeedbackRecord[] }>(`/api/ops/feedback?${params}`, { token, signal })
export const getOpsFeedback = (token: string, id: string, signal?: AbortSignal) => apiRequest<OpsFeedbackRecord>(`/api/ops/feedback/${encodeURIComponent(id)}`, { token, signal })
export const updateOpsFeedback = (token: string, id: string, input: Partial<Pick<OpsFeedbackRecord, 'status' | 'priority' | 'handledVersion' | 'noActionReason' | 'mergedIntoId'>> & { officialReply?: string }) => apiRequest<OpsFeedbackRecord>(`/api/ops/feedback/${encodeURIComponent(id)}`, { token, method: 'PATCH', body: input })
export const addOpsFeedbackMessage = (token: string, id: string, input: { kind: 'internal-note' | 'user-reply'; text: string }) => apiRequest<OpsFeedbackRecord>(`/api/ops/feedback/${encodeURIComponent(id)}/messages`, { token, method: 'POST', body: input })
