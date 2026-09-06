import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./BowelRecordFlow.tsx', import.meta.url), 'utf8')

test('bowel form exposes the confirmed fields without diagnostic or low-value choices', () => {
  for (const label of ['硬小颗粒', '细小颗粒', '成团偏硬', '光滑条状', '松散软块', '糊状', '水样', '无法判断', '1–2分钟', '超过10分钟', '疑似看到', '奶瓣或食物残渣', '没有特别发现']) assert.match(source, new RegExp(label))
  assert.doesNotMatch(source, /很臭|许多屁|胃痉挛|布里斯托|正常|异常|便秘|腹泻|过敏/)
})

test('bowel form keeps image then time then save order and six-photo limit', () => {
  assert.ok(source.indexOf('<BowelPhotos') < source.indexOf('label="记录时间"'))
  assert.ok(source.indexOf('label="记录时间"') < source.indexOf('保存记录'))
  assert.match(source, /useQuickRecordPhotos\(memberId, token, 6\)/)
  assert.match(source, /capture="environment"/)
  assert.match(source, /hoooho-bowel-record-draft:/)
})
