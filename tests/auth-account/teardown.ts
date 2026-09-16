import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export default async function teardown() {
  const marker = path.resolve('.codex-tmp/auth-account-shutdown')
  await mkdir(path.dirname(marker), { recursive: true })
  await writeFile(marker, '')
}
