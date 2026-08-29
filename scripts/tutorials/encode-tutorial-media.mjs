import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const sourceRoot = path.resolve(process.argv[2] || path.join(repositoryRoot, '.codex-tmp/tutorial-recordings'))
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg'
const scenarios = JSON.parse(await readFile(path.join(repositoryRoot, 'tutorials/scenarios/core-tutorials.json'), 'utf8'))
const recordingsDirectory = path.join(repositoryRoot, 'public/tutorials/recordings')
const postersDirectory = path.join(repositoryRoot, 'public/tutorials/posters')
const workingDirectory = path.join(repositoryRoot, '.codex-tmp/tutorial-encode')

await Promise.all([recordingsDirectory, postersDirectory, workingDirectory].map((directory) => mkdir(directory, { recursive: true })))

function escapeConcatPath(value) {
  return value.replaceAll('\\', '/').replaceAll("'", "'\\''")
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)))
  })
}

for (const scenario of scenarios) {
  const scenarioDirectory = path.join(sourceRoot, scenario.id)
  const concatPath = path.join(workingDirectory, `${scenario.id}.txt`)
  const concatLines = scenario.frames.flatMap(([fileName, duration]) => [
    `file '${escapeConcatPath(path.join(scenarioDirectory, fileName))}'`,
    `duration ${duration}`
  ])
  concatLines.push(`file '${escapeConcatPath(path.join(scenarioDirectory, scenario.frames.at(-1)[0]))}'`)
  await writeFile(concatPath, `${concatLines.join('\n')}\n`, 'utf8')

  await run([
    '-hide_banner', '-loglevel', 'warning', '-y', '-f', 'concat', '-safe', '0', '-i', concatPath,
    '-vf', 'fps=15,scale=375:667:flags=lanczos,format=yuv420p', '-an',
    '-c:v', 'libvpx-vp9', '-crf', '38', '-b:v', '0', '-deadline', 'good', '-cpu-used', '2', '-row-mt', '1',
    path.join(recordingsDirectory, `${scenario.id}.webm`)
  ])

  await run([
    '-hide_banner', '-loglevel', 'warning', '-y', '-i', path.join(scenarioDirectory, scenario.posterFrame),
    '-vf', 'scale=375:667:flags=lanczos', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '76', '-compression_level', '6',
    path.join(postersDirectory, `${scenario.id}.webp`)
  ])
}

console.info(`Encoded ${scenarios.length} tutorial recordings from ${sourceRoot}`)
