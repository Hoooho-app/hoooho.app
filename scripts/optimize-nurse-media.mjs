import { spawnSync } from 'node:child_process'
import path from 'node:path'
// Explicit path or system ffmpeg; no runtime dependency or original overwrite.
const ffmpeg = process.argv[2] || 'ffmpeg'
const directory = path.resolve(import.meta.dirname, '../src/assets/nurse-triage')
for (const name of ['nurses-idle-intro-0', 'nurses-idle-loop-1', 'nurses-idle-loop-2', 'nurse-save-success-ok']) {
  const result = spawnSync(ffmpeg, ['-n', '-hide_banner', '-i', path.join(directory, `${name}.mp4`),
    '-map', '0:v:0', '-an', '-map_metadata', '-1', '-vf', 'scale=576:576:flags=lanczos,fps=24,setsar=1',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-profile:v', 'main', '-level', '3.1',
    '-pix_fmt', 'yuv420p', '-maxrate', '850k', '-bufsize', '1700k', '-g', '48', '-movflags', '+faststart',
    path.join(directory, `${name}-mobile.mp4`)], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status || 1)
}
