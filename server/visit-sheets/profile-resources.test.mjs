import test from 'node:test'
import assert from 'node:assert/strict'
import {profileResources} from './profile-resources.mjs'
test('档案原件使用白名单，成员隔离且不把字节写入报告元数据',()=>{
  const input=[{sectionId:'allergy',records:[{_allergyArchive:{items:[{id:'a',memberId:'child',name:'真实结构虚构样本',tests:[{memberId:'other',reportFiles:['data:image/png;base64,AAAA']},{reportFiles:['data:image/png;base64,BBBB','data:application/pdf;base64,CCCC','https://example.test/private','data:image/svg+xml;base64,DDDD']}]}]}}]}]
  const metadata=profileResources(input,'child')
  assert.equal(metadata.length,2);assert.ok(!JSON.stringify(metadata).includes('BBBB'));assert.equal(new Set(metadata.map(r=>r.resourceId)).size,2)
  const full=profileResources(input,'child',true);assert.equal(full[0].data,'BBBB');assert.equal(full[0].parentId,'profile:allergy:a')
  assert.equal(profileResources(input,'other').length,0)
})
