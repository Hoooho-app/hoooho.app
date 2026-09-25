import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
const page=fs.readFileSync(new URL('./index.tsx',import.meta.url),'utf8')
const flow=fs.readFileSync(new URL('./MedicationReminderFlow.tsx',import.meta.url),'utf8')
const card=fs.readFileSync(new URL('./MedicationReminderCard.tsx',import.meta.url),'utf8')
const cardLogic=fs.readFileSync(new URL('./medicationCardLogic.ts',import.meta.url),'utf8')
const css=fs.readFileSync(new URL('./nurseStation.css',import.meta.url),'utf8')
test('一级页只保留用药提醒和排敏测试并直接进入提醒流程',()=>{assert.match(page,/用药提醒[\s\S]*排敏测试/);assert.doesNotMatch(page,/疫苗提醒|ServiceBottomSheet/)})
test('保留三步新增流程，卡片只提供记录撤回归档删除',()=>{for(const text of ['药品和每次用量','提醒规律','确认提醒'])assert.match(flow,new RegExp(text));for(const text of ['撤回','归档','删除提醒'])assert.match(card,new RegExp(text));assert.match(cardLogic,/已服用/);assert.doesNotMatch(card,/10分钟后提醒|跳过本次|调整计划/);assert.match(page,/medicationReminderService\.complete/)})
test('移动流程使用动态视口且正文可在键盘和小屏下独立滚动',()=>{assert.match(css,/height:100dvh/);assert.match(css,/\.med-reminder-body[^}]*overflow-y:auto/)})
test('首页不展示通知权限说明也不会自动申请',()=>{assert.doesNotMatch(page,/guardian-notification-notice|Notification\.requestPermission|用药计划仍会保留/)})
test('入口可用性与真实能力一致',()=>{assert.match(page,/'新增测试':'新增提醒'/);assert.match(page,/disabled=\{!stationIsCurrent\}/);assert.doesNotMatch(page,/guardian-task-add|本轮暂不新增业务流程/)})
