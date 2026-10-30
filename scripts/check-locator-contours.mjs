import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const root=new URL('../',import.meta.url)
const data=JSON.parse(await readFile(new URL('src/features/body-location/child-data/selection-contours.json',root),'utf8'))
assert.equal(data.version,1)
for(const [asset,source] of Object.entries(data.assets)){
 const bytes=await readFile(new URL(`public${asset}`,root))
 assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256,`Stale contour: ${asset}`)
 assert.ok(source.contours.length>0&&source.contours.flat().length>20,`Missing silhouette: ${asset}`)
 for(const point of source.contours.flat())assert.ok(point.length===2&&point.every(n=>Number.isFinite(n)&&n>=0&&n<=1),`Invalid contour: ${asset}`)
}
console.log(JSON.stringify({selectionSilhouettes:Object.keys(data.assets).length,sourceHashes:'PASS'}))
