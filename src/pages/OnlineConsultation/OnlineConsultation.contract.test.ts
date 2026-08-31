import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const actionSheet = readFileSync(new URL('../HealthEventDetail/components/ActionSheet.tsx', import.meta.url), 'utf8')
const router = readFileSync(new URL('../../app/router.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../../styles/index.css', import.meta.url), 'utf8')

test('在线问诊不再出现在下一步入口，但历史独立页面仍保持兼容', () => {
  assert.match(actionSheet, /health-action-tabs/)
  assert.doesNotMatch(actionSheet, /onOnlineConsultation/)
  assert.match(router, /:eventId\/online-consultation/)
  assert.doesNotMatch(actionSheet, />在线问诊</)
})

test('页面包含资料复制、手动状态、医生问题和结束写回流程', () => {
  for (const text of ['资料已整理', '复制全部', '等待接诊', '医生问我', '医生问了什么？', '帮我准备回复', '复制回复', '本次问诊记录', '结束本次问诊', '保存医生交代']) {
    assert.equal(page.includes(text), true, `missing ${text}`)
  }
  assert.equal(page.includes('自动发送'), false)
  assert.equal(page.includes('第三方账号'), false)
  assert.match(styles, /safe-area-inset-bottom/)
})

test('语音、复制和错误状态都有可访问入口', () => {
  assert.match(page, /aria-label=\{listening \? '停止语音输入' : '语音输入医生问题'\}/)
  assert.match(page, /aria-label=\{`复制\$\{section\.title\}`\}/)
  assert.match(page, /role="alert"/)
  assert.match(page, /复制失败，请长按选择文字复制/)
})
