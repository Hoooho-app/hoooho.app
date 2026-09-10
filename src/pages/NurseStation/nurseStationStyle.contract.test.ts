import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const styles = readFileSync(new URL('./nurseStation.css', import.meta.url), 'utf8')

test('当前记录对象卡片使用确认的白色背景', () => {
  assert.match(styles, /\.nurse-station-member \{[^}]*background: #fff;/)
})

test('护士站一级页只保留三个清晰可用的服务入口', () => {
  assert.match(styles, /\.nurse-service-list \{[^}]*grid-template-rows: repeat\(3, 62px\)/)
  assert.match(styles, /\.nurse-service-entry \{[^}]*grid-template-columns: 22px minmax\(0, 1fr\) 15px/)
  assert.match(styles, /\.nurse-service-entry small \{[^}]*-webkit-line-clamp: 2/)
  assert.doesNotMatch(styles, /\.nurse-service-entry:disabled/)
})
