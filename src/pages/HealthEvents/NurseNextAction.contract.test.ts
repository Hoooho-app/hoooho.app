import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const source = read('./NurseNextAction.tsx')
const styles = read('./NurseNextAction.css')

test('就诊情况单首次进入自动整理且旧版本直接打开', () => {
  assert.match(source, /initial \? 'result' : 'working'/)
  assert.match(source, /正在整理已有记录/)
  assert.match(source, /按情况、经过与依据生成/)
  assert.match(source, /sourceFingerprint !== fingerprint/)
  assert.doesNotMatch(source, /复制 AI 问诊提示词|去问 AI|去医院|资料范围|用途选择/)
})

test('情况单保留更新失败旧版并提供阅读交付能力', () => {
  assert.match(source, /有新内容待同步/)
  assert.match(source, /更新情况单/)
  assert.match(source, /继续查看原情况单/)
  assert.match(source, /当面出示/)
  assert.match(source, /分享只读情况单/)
  assert.match(source, /下载交互式文件/)
  assert.match(source, /查看原始依据/)
  assert.match(source, /情况单目录/)
})

test('iPhone SE 延续项目令牌和底部弹层', () => {
  assert.match(source, /BottomSheetSurface/)
  assert.match(styles, /@media \(max-height: 700px\)/)
  assert.match(styles, /var\(--hoho-color-primary\)/)
  assert.doesNotMatch(styles, /linear-gradient/)
})
