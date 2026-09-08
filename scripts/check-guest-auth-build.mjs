import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [index, sw] = await Promise.all([readFile('dist/index.html', 'utf8'), readFile('dist/sw.js', 'utf8')])
assert.match(index, /assets\/index-[A-Za-z0-9_-]+\.js/)
assert.match(sw, /skipWaiting\(\)/)
assert.match(sw, /clientsClaim\(\)/)
assert.doesNotMatch(sw, /api\/auth\/session/)
assert.doesNotMatch(sw, /api\/auth\/guest/)
console.log('Guest auth build contract passed: versioned entry, immediate SW activation, no auth API precache.')
