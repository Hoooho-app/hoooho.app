import { writeFile } from 'node:fs/promises'
export default async function teardown() {
  await writeFile(new URL(process.env.VISIT_SHUTDOWN_FILE ?? './.shutdown', import.meta.url), 'stop', 'utf8')
}
