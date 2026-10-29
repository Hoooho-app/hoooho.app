import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import sharp from 'sharp'
const {assets,version}=JSON.parse(await readFile('public/body-locator/v3/manifest.json','utf8'))
assert.equal(version,'3.0.0')
for(const [name,item] of Object.entries(assets)){
 const bytes=await readFile(`public${item.asset}`),meta=await sharp(bytes).metadata()
 assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,name)
 assert.equal(bytes.length,item.bytes);assert.ok(bytes.length<=200*1024)
 assert.equal(meta.width,item.width);assert.equal(meta.height,item.height);assert.equal(meta.hasAlpha,true)
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true})
 for(const [x,y] of [[0,0],[info.width-1,0],[0,info.height-1],[info.width-1,info.height-1]])assert.equal(data[(y*info.width+x)*4+3],0,`${name}: transparent corner`)
 if(/^(girl|boy)-/.test(name)){const index=(Math.floor(info.height*.61)*info.width+Math.floor(info.width*.5))*4;assert.ok(data[index+3]>=250,`${name}: clothing must not be cut out`)}
}
assert.ok(assets['arm-front'].height>=1400&&assets['arm-back'].height>=1400)
assert.ok(assets['leg-atlas'].height>=1000&&assets['torso-atlas'].width/2>=600)
console.log(JSON.stringify({locatorDetailAssets:Object.keys(assets).length,alpha:'PASS',mobileBudgets:'PASS',closeupPixels:'PASS'}))
