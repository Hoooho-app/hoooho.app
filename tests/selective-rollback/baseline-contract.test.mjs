import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'

const baseline=JSON.parse(await readFile(new URL('./baseline.json',import.meta.url),'utf8'))
for(const [path,expected] of Object.entries(baseline.identicalFiles))test(`Accepted 13:46 interaction source unchanged: ${path}`,async()=>{
 // A Windows checkout uses CRLF; Git blobs and Linux CI use LF.
 const source=(await readFile(new URL(`../../${path}`,import.meta.url),'utf8')).replaceAll('\r\n','\n')
 assert.equal(createHash('sha256').update(source).digest('hex'),expected)
})
