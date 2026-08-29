import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const mediaSource = readFileSync(new URL('./TutorialMedia.tsx', import.meta.url), 'utf8')
const detailSource = readFileSync(new URL('./TutorialDetailSheet.tsx', import.meta.url), 'utf8')

test('使用说明提供搜索、四个场景入口和真实功能跳转', () => {
  assert.match(pageSource, /placeholder="例如：怎么记录体温"/)
  assert.match(pageSource, /guideFilters\.map/)
  assert.match(pageSource, /to=\{tutorial\.actionTo\}/)
  assert.match(pageSource, /三分钟了解 Hoooho/)
  assert.match(pageSource, /你可能还不知道/)
})

test('动态教程支持可视区播放、失败封面和减少动态效果', () => {
  assert.match(mediaSource, /IntersectionObserver/)
  assert.match(mediaSource, /prefers-reduced-motion: reduce/)
  assert.match(mediaSource, /poster=\{media\.poster\}/)
  assert.match(mediaSource, /onError=\{\(\) => \{ setFailed\(true\)/)
  assert.match(mediaSource, /loop/)
  assert.match(mediaSource, /muted/)
  assert.match(mediaSource, /playsInline/)
})

test('详细教程使用大尺寸底部抽屉并支持步骤前后切换', () => {
  assert.match(detailSource, /size="workspace"/)
  assert.match(detailSource, /上一步/)
  assert.match(detailSource, /下一步/)
  assert.match(detailSource, /tutorial\.actionTo/)
})
