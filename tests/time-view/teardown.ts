import { writeFile } from 'node:fs/promises'
import path from 'node:path'
export default async function teardown() {
  await writeFile(path.resolve(import.meta.dirname, '../../.codex-tmp/time-view-shutdown'), '')
}
