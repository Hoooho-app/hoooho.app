import { writeFile } from 'node:fs/promises'
export default async function teardown() {
  await writeFile(new URL('./.shutdown', import.meta.url), 'stop', 'utf8')
}
