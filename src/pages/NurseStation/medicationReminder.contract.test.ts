import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
const page=fs.readFileSync(new URL('./index.tsx',import.meta.url),'utf8')
const flow=fs.readFileSync(new URL('./MedicationReminderFlow.tsx',import.meta.url),'utf8')
const css=fs.readFileSync(new URL('./nurseStation.css',import.meta.url),'utf8')
test('一级页固定三项并直接进入提醒流程',()=>{assert.match(page,/用药提醒[\s\S]*排敏测试[\s\S]*疫苗提醒/);assert.doesNotMatch(page,/ServiceBottomSheet/)})
test('三步流程、计划动作和真实随记写入均存在',()=>{for(const text of ['药品和每次用量','提醒规律','确认提醒','已服用','10分钟后提醒','跳过本次','调整计划'])assert.match(flow,new RegExp(text));assert.match(page,/quickRecordService\.create/)})
test('移动流程使用动态视口且不允许主体滚动',()=>{assert.match(css,/height:100dvh/);assert.match(css,/\.med-reminder-body[^}]*overflow:hidden/)})
