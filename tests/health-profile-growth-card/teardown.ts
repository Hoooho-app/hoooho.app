import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export default async function teardown() {
  const dataDirectory = path.resolve(import.meta.dirname, '../../.codex-tmp/health-profile-growth-card-e2e')
  await mkdir(dataDirectory, { recursive: true })
  await writeFile(path.join(dataDirectory, 'shutdown'), 'stop')
}
