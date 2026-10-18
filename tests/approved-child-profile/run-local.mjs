import { spawn } from 'node:child_process'
import { setTimeout } from 'node:timers/promises'
const children = []
const start = (args, options = {}) => { const child = spawn(process.execPath, args, { stdio: 'inherit', ...options }); children.push(child); return child }
const run = args => new Promise((resolve, reject) => { const child = start(args, { env: { ...process.env, CHROME_PATH: process.env.CHROME_PATH ?? '/root/.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell' } }); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${args[0]} exited ${code}`))) })
async function ready(url) { for (let i = 0; i < 120; i++) { try { if ((await fetch(url)).ok) return } catch {} await setTimeout(500) } throw new Error(`Not ready: ${url}`) }
try {
  const holdOnly = process.argv.includes('--hold-only')
  if (!holdOnly) start(['tests/child-profile/serve.mjs'])
  start(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4207'])
  await Promise.all([...(holdOnly ? [] : [ready('http://127.0.0.1:4194/api/health')]), ready('http://127.0.0.1:4207/tests/hold-to-talk/index.html')])
  if (!holdOnly) await run(['tests/approved-child-profile/verify.mjs'])
  await run(['tests/hold-to-talk/verify.mjs'])
} finally { for (const child of children) if (child.exitCode == null) child.kill('SIGTERM') }
