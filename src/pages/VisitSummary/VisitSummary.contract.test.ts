import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8')
test('情况单仍可从侧边栏和记录流程进入，首页不再常驻，旧链接兼容',()=>{
  assert.match(read('../../app/router.tsx'),/path: '\/visit-summary'/);assert.match(read('../../app/router.tsx'),/visit-summary\/:eventId/)
  assert.doesNotMatch(read('../NurseStation/HomeFlows.tsx'),/navigate\('\/visit-summary'\)/);assert.match(read('../../components/navigation/SideDrawer.tsx'),/to: '\/visit-summary'/);assert.match(read('../HealthEvents/index.tsx'),/<Navigate to="\/visit-summary"/)
})
test('旧分享组件保留，新导出总是包含全部章节与来源',()=>{
  assert.match(read('./index.tsx'),/export.*VisitSummaryContent.*LegacyVisitSummary/);assert.match(read('./reportExport.tsx'),/report.chapters.map/);assert.match(read('./reportExport.tsx'),/report.sources.map/);assert.doesNotMatch(read('./reportExport.tsx'),/activeChapter|navigator.share/)
})
