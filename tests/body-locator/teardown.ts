import { writeFile } from 'node:fs/promises'
import path from 'node:path'
export default async function teardown(){await writeFile(path.resolve(process.env.BODY_LOCATOR_SHUTDOWN_FILE ?? path.resolve(import.meta.dirname,'../../.codex-tmp/body-locator-shutdown')),'')}
