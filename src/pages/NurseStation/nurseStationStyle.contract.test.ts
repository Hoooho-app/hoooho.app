import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const styles = readFileSync(new URL('./nurseStation.css', import.meta.url), 'utf8')

test('当前记录对象卡片使用确认的绿色背景', () => {
  assert.match(styles, /\.nurse-station-member \{[^}]*background: #5fb99c;/)
})
