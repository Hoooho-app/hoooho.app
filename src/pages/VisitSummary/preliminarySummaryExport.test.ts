import test from 'node:test'
import assert from 'node:assert/strict'
import { preliminarySummaryExport } from './preliminarySummaryExport'
test('初步摘要文本和HTML永远待核对，内容被转义，无可执行HTML',()=>{
  const preview={status:'unverified' as const,text:'合成',provider:'bailian',model:'qwen3.7-plus',requestId:'synthetic',warning:'尚未验证',issues:[{message:'来源未通过',fieldPath:'/keyPoints/0',stage:'source_validation'}]}
  const text=preliminarySummaryExport('没有呕吐，只是恶心',preview,'text')
  assert.match(text,/待核对（非已确认报告）/);assert.match(text,/没有呕吐，只是恶心/)
  const html=preliminarySummaryExport('<script>恶心</script>',preview,'html')
  assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/default-src 'none'/)
})
