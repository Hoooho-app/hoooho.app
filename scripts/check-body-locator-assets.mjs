import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const base = new URL('../',import.meta.url)
const readJson=async path=>JSON.parse(await readFile(new URL(path,base),'utf8'))
const manifest=await readJson('src/features/body-location/child-data/source-manifest.json')
for(const item of manifest.files.filter(item=>item.path.startsWith('assets/')||item.path.startsWith('data/')&&!item.path.endsWith('.csv'))){
  const path=item.path.startsWith('assets/')?item.path.replace('assets/','public/body-locator/v1/'):item.path.replace('data/','src/features/body-location/child-data/')
  const bytes=await readFile(new URL(path,base))
  assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,`${path} must match frozen source`)
}
const data=await readJson('src/features/body-location/child-data/locations.json')
const all=data.regions.flatMap(region=>region.items)
const neutral=await readJson('public/body-locator/v2/manifest.json')
assert.equal(neutral.version,'2.0.0')
for(const file of neutral.files){
  const bytes=await readFile(new URL(`public/body-locator/v2/${file.name}`,base))
  assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256)
  assert.equal(bytes.readUInt32BE(16),1024);assert.equal(bytes.readUInt32BE(20),1536)
}
assert.equal(new Set(all.map(item=>item.id)).size,569)
assert.equal(data.regions.length,40)
console.log(JSON.stringify({assets:10,regions:data.regions.length,locations:all.length,boy:all.filter(i=>i.sex.includes('boy')).length,girl:all.filter(i=>i.sex.includes('girl')).length,frozenHashes:'PASS'}))
