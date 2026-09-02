import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export default async function teardown() {
  const directory = path.resolve('.codex-tmp/quick-record-mobile-e2e')
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, 'shutdown'), '')
}
