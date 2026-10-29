import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'

const manifest = JSON.parse(await readFile('public/icons/material-v3/manifest.json', 'utf8'))
assert.equal(manifest.sourceCommit, '10ecc14790612ca8fd164e3f4ffe9c16fc50d5b7')
assert.equal(manifest.style, 'Material Symbols Rounded')
assert.equal(manifest.weight, 300)
assert.equal(manifest.opticalSize, 24)
assert.equal(manifest.grade, 0)
const compiled = await readFile('src/components/icons/materialPaths.ts', 'utf8')
const paths = JSON.parse(compiled.slice(compiled.indexOf('=') + 1, compiled.lastIndexOf(' as const')).trim())
for (const item of manifest.files) {
  const bytes = await readFile(`public/icons/material-v3/${item.file}`)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256, item.file)
  const svg = bytes.toString()
  assert.match(svg, /viewBox="0 -960 960 960"/)
  const original = svg.match(/<path d="([^"]+)"/)[1]
  assert.equal(paths[item.name][item.fill ? 'filled' : 'outline'], original, `${item.file} must retain the original mother path`)
}
assert.equal(Object.keys(paths).length, 158)
assert.equal(manifest.files.length, 316)

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map(async item => item.isDirectory() ? walk(`${directory}/${item.name}`) : [`${directory}/${item.name}`]))).flat()
}
for (const file of await walk('src')) {
  if (!/\.(tsx?|css)$/.test(file)) continue
  const text = await readFile(file, 'utf8')
  assert.doesNotMatch(text, /(?:from\s*|import\s*\()['"]lucide-react['"]/, `${file} must use the shared set`)
  if (!file.endsWith('.test.ts')) assert.doesNotMatch(text, /assets\/health-events\/(?:daily-record|diet-record|record-cards)\//, `${file} must not restore picture icons`)
}
const categories = await readFile('src/pages/HealthEvents/JournalCategoryIcon.tsx', 'utf8')
assert.match(categories, /sleep: 'bedtime'/)
assert.match(categories, /visit: 'stethoscope'/)
assert.match(categories, /examination: 'lab_research'/)
const login = await readFile('src/pages/Login/LoginMethodIcon.tsx', 'utf8')
assert.match(login, /ProviderBrandIcon provider="apple"/)
const account = await readFile('src/pages/Account/index.tsx', 'utf8')
assert.match(account, /ProviderBrandIcon provider=\{provider\}/)
assert.doesNotMatch(account, /<Apple\b/)
console.log(JSON.stringify({ source:manifest.sourceCommit, shapes:Object.keys(paths).length, originalSvgFiles:manifest.files.length, runtimeLegacyImports:0, paths:'original', semantics:'consistent' }))
