export function parseJsonObject(raw) {
  let value
  try { value = raw ? JSON.parse(raw) : {} }
  catch { throw Object.assign(new Error('请求格式错误'), { status: 400, code: 'INVALID_JSON' }) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('请求内容必须是对象'), { status: 400, code: 'INVALID_JSON_BODY' })
  }
  return value
}
