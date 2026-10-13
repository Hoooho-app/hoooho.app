import { writeFile } from 'node:fs/promises'
import path from 'node:path'
export default async function teardown() { await writeFile(path.resolve('.codex-tmp/paper-visual-e2e/shutdown'), '') }
