import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

const repositoryRoot = new URL('../../', import.meta.url)

function runtimeFiles(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const url = new URL(entry.name, directory)
    if (entry.isDirectory()) {
      if (entry.name === 'adversarial') return []
      return runtimeFiles(new URL(`${entry.name}/`, directory))
    }
    if (/\.(test|contract\.test)\.(ts|tsx|mjs)$/.test(entry.name)) return []
    return /\.(ts|tsx|mjs)$/.test(entry.name) ? [url] : []
  })
}

test('用户可见运行时代码统一使用健康随记', () => {
  const files = [
    new URL('index.html', repositoryRoot),
    new URL('vite.config.ts', repositoryRoot),
    ...runtimeFiles(new URL('src/', repositoryRoot)),
    ...runtimeFiles(new URL('server/', repositoryRoot))
  ]
  const leftovers = files.flatMap((file) => {
    const source = readFileSync(file, 'utf8')
    // The reminder board category and nurse-station homepage card intentionally
    // use “健康事件”. Keep both approved exceptions local and exact.
    const checkedSource = file.pathname.endsWith('/pages/HealthEvents/timeViewModel.ts')
      ? source.replace("label: '健康事件'", '')
      : file.pathname.endsWith('/pages/NurseStation/index.tsx')
        ? source.replace('健康事件记录', '').replace('健康事件记一下', '')
        : source
    return checkedSource.includes('健康事件') ? [file.pathname] : []
  })

  assert.deepEqual(leftovers, [])
})
