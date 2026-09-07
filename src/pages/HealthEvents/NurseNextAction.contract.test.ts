import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const source = read('./NurseNextAction.tsx')
const styles = read('./NurseNextAction.css')

test('就医准备弹窗始终只提供摘要和 AI 提示词两个操作', () => {
  assert.match(source, /生成病情摘要/)
  assert.match(source, /更新病情摘要/)
  assert.match(source, /复制 AI 问诊提示词/)
  assert.match(source, /生成可交互查看的病情摘要/)
  assert.match(source, /适用于 AI 问诊场景/)
  assert.doesNotMatch(source, /去问 AI|去医院|去求助|选择要生成的信息|资料范围|用途选择/)
})

test('摘要支持原位更新、无变化反馈和最新提示词复制', () => {
  assert.match(source, /sourceFingerprint !== fingerprint/)
  assert.match(source, /saveMedicalPreparation/)
  assert.match(source, /病情摘要已更新/)
  assert.match(source, /病情摘要已经是最新的/)
  assert.match(source, /暂无需要同步的新记录/)
  assert.match(source, /AI 问诊提示词已复制/)
  assert.match(source, /1500/)
})

test('iPhone SE 延续项目令牌和半屏弹窗', () => {
  assert.match(source, /BottomSheetSurface/)
  assert.match(styles, /min-height: 70px/)
  assert.match(styles, /@media \(max-height: 700px\)/)
  assert.match(styles, /var\(--hoho-color-primary\)/)
  assert.doesNotMatch(styles, /linear-gradient/)
})
