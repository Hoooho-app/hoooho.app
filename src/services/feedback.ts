import { apiRequest } from './apiClient'
export type FeedbackInput={category:string;description:string;page:string;device:'手机'|'电脑';contact:string;includeDiagnostics:boolean}
export function submitFeedback(token:string,input:FeedbackInput){return apiRequest<{id:string;status:'received';createdAt:string}>('/api/feedback',{token,method:'POST',body:input})}
