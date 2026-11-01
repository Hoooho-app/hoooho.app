import { isProductPathVisible } from './product-visibility.mjs'
import { ANALYTICS_ROUTES } from './product-analytics-routes.mjs'

export const ANALYTICS_SCHEMA = 1
export const ANALYTICS_CHOICES = Object.freeze({ symptom: '记录症状', feeding: '喂养/饮食', diet: '喂养与饮食', daily: '日常', sleep: '睡眠', elimination: '排便', medication: '用药', materials: '就诊资料' })
export const ANALYTICS_RETENTION_DAYS = 90
export const ANALYTICS_KINDS = ['app_open', 'page_view', 'page_time', 'page_exit', 'exposure', 'click', 'surface_view', 'operation_start', 'operation_success', 'operation_failure', 'operation_cancel']
export const analyticsPages = () => ANALYTICS_ROUTES.map(([id, name]) => ({ id, name, available: isProductPathVisible(id) }))
const matches = (pattern, path) => new RegExp(`^${pattern.split('/').map(part => part === '*' ? '.*' : part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/')}/?$`).test(path)
export function analyticsPage(path) {
  const pathname = String(path).split(/[?#]/, 1)[0]
  if (/^\/(?:ops|api|family-ray-home-life-workspace|qinggan-jichoushi-notebook)(?:\/|$)/.test(pathname)) return null
  return analyticsPages().find(item => item.id !== '*' && matches(item.id, pathname)) ?? analyticsPages().find(item => item.id === '*')
}

// Only endpoint shapes and methods are inspected. Input and response content stay in their business services.
export const ANALYTICS_OPERATIONS = [
  { id: 'login', name: '登录', method: 'POST', pattern: /^\/api\/auth\/(?:nickname\/login|email\/login|login)$/ },
  { id: 'register', name: '注册', method: 'POST', pattern: /^\/api\/auth\/register$/ },
  { id: 'logout', name: '退出登录', method: 'POST', pattern: /^\/api\/auth\/logout$/ },
  { id: 'transcribe', name: '语音转写', method: 'POST', pattern: /^\/api\/ai\/audio\/transcriptions$/ },
  { id: 'smart_process', name: '智能记录处理', method: 'POST', pattern: /^\/api\/members\/[^/]+\/recognition-jobs$/ },
  { id: 'smart_draft', name: '生成智能记录草稿', method: 'POST', pattern: /^\/api\/members\/[^/]+\/ai-drafts$/ },
  { id: 'smart_save', name: '智能记录保存', method: 'POST', pattern: /^\/api\/members\/[^/]+\/ai-drafts\/[^/]+\/save$/ },
  { id: 'smart_edit', name: '修改智能记录', method: 'NONE', pattern: /$^/ },
  { id: 'auto_save', name: '对话记录自动保存回执', method: 'RECEIPT', pattern: /$^/ },
  { id: 'record_export', name: '记录导出', method: 'NONE', pattern: /$^/ },
  { id: 'download_requested', name: '发起文件下载', method: 'NONE', pattern: /$^/ },
  { id: 'visit_save', name: '保存就诊情况单', method: 'PUT', pattern: /^\/api\/members\/[^/]+\/visit-sheet$/ },
  { id: 'handoff_share', name: '创建照护交接链接', method: 'POST', pattern: /^\/api\/members\/[^/]+\/care-handoff\/share$/ },
  { id: 'record_save', name: '手动记录保存', method: 'POST', pattern: /^\/api\/(?:quick-records|events\/[^/]+\/records)$/ },
  { id: 'record_edit', name: '修改记录', method: 'PATCH', pattern: /^\/api\/records\/[^/]+$/ },
  { id: 'record_delete', name: '删除记录', method: 'DELETE', pattern: /^\/api\/records\/[^/]+$/ },
  { id: 'event_create', name: '创建健康事项', method: 'POST', pattern: /^\/api\/events$/ },
  { id: 'organize_preview', name: '整理记录草稿', method: 'POST', pattern: /^\/api\/events\/[^/]+\/organizations\/preview$/ },
  { id: 'organize_confirm', name: '确认整理并保存', method: 'POST', pattern: /^\/api\/events\/[^/]+\/organizations\/confirm$/ },
  { id: 'profile_save', name: '保存孩子档案', method: 'POST', pattern: /^\/api\/members$/ },
  { id: 'profile_edit', name: '修改孩子档案', method: 'PATCH', pattern: /^\/api\/members\/[^/]+$/ },
  { id: 'growth_save', name: '保存生长数据', method: 'POST', pattern: /^\/api\/growth-measurements$/ },
  { id: 'feedback_send', name: '提交反馈', method: 'POST', pattern: /^\/api\/feedback$/ },
  { id: 'checkin', name: '领取树芽', method: 'POST', pattern: /^\/api\/care-journey\/check-in$/ }
]
export function analyticsOperation(path, method = 'GET', action = '') {
  if (method === 'POST' && /^\/api\/members\/[^/]+\/front-desk-record\/contexts\/[^/]+$/.test(path.split('?')[0])) {
    const id = ({ save_current: 'smart_save', save_original: 'smart_save', edit_current: 'smart_edit', export_current: 'record_export' })[action]
    if (id) return ANALYTICS_OPERATIONS.find(item => item.id === id)
  }
  return ANALYTICS_OPERATIONS.find(item => item.method === method && item.pattern.test(path.split('?')[0])) ?? null
}
