#!/usr/bin/env node

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const ignoredDirectories = new Set([
  '.git', '.agents', '.codex', '.codex-tmp', '.runtime', '.worktrees',
  'node_modules', 'dist', 'build', 'coverage', '.next'
])
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'])

function usage() {
  console.log('Usage: node inventory-interactions.mjs [app-root] [--json file] [--markdown file]')
}

function parseArguments(argv) {
  const options = { root: '.', json: null, markdown: null }
  let rootSet = false
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--help' || value === '-h') {
      usage()
      process.exit(0)
    }
    if (value === '--json' || value === '--markdown') {
      const destination = argv[index + 1]
      if (!destination) throw new Error(`${value} requires a file path`)
      options[value.slice(2)] = destination
      index += 1
      continue
    }
    if (value.startsWith('-')) throw new Error(`Unknown option: ${value}`)
    if (rootSet) throw new Error(`Unexpected argument: ${value}`)
    options.root = value
    rootSet = true
  }
  return options
}

async function walk(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(absolute))
    else if (
      entry.isFile() &&
      sourceExtensions.has(path.extname(entry.name)) &&
      !/\.(?:test|spec)\.[^.]+$/i.test(entry.name)
    ) files.push(absolute)
  }
  return files
}

function countMatches(source, expression) {
  return [...source.matchAll(expression)].length
}

function analyzeFile(source, relativeFile) {
  const isRouteDefinition = /(?:^|\/)(?:router|routes?)(?:\.|\/)/i.test(relativeFile) ||
    /\bcreateBrowserRouter\b|<Route\b/.test(source)
  const routes = isRouteDefinition
    ? [...source.matchAll(/\bpath\s*:\s*['"]([^'"]+)['"]/g)].map((match) => match[1])
    : []
  const signals = {
    buttons: countMatches(source, /<button\b/gi),
    links: countMatches(source, /<a\b/gi),
    inputs: countMatches(source, /<(?:input|textarea|select)\b/gi),
    forms: countMatches(source, /<form\b/gi),
    click_handlers: countMatches(source, /\bonClick\s*=/g),
    submit_handlers: countMatches(source, /\bonSubmit\s*=/g),
    keyboard_handlers: countMatches(source, /\bonKey(?:Down|Up|Press)\s*=/g),
    button_roles: countMatches(source, /\brole\s*=\s*['"]button['"]/gi),
    overlays: countMatches(source, /<(?:[A-Z][\w.]*)?(?:Dialog|Modal|Drawer|Sheet|Popover|Menu)\b/g),
    media: countMatches(source, /<(?:audio|video)\b/gi)
  }
  const totalSignals = Object.values(signals).reduce((sum, count) => sum + count, 0)
  return { file: relativeFile, routes, signals, total_signals: totalSignals }
}

function markdownFor(inventory) {
  const lines = [
    '# Static interaction inventory seed',
    '',
    `Generated: ${inventory.generated_at}`,
    '',
    `Application root: \`${inventory.app_root}\``,
    '',
    '> This is a static seed. Runtime browser verification is required before marking any interaction PASS.',
    '',
    '## Routes',
    '',
    '| Route | Definition file | Runtime status | Evidence |',
    '| --- | --- | --- | --- |'
  ]
  for (const route of inventory.routes) {
    lines.push(`| ${route.path.replaceAll('|', '\\|')} | \`${route.file}\` | NOT_RUN | |`)
  }
  if (inventory.routes.length === 0) lines.push('| _No literal route definitions detected_ | | NOT_RUN | |')

  lines.push('', '## Files with interaction signals', '',
    '| File | Signals | Count | Runtime status |',
    '| --- | --- | ---: | --- |')
  for (const file of inventory.files.filter((entry) => entry.total_signals > 0)) {
    const summary = Object.entries(file.signals).filter(([, count]) => count > 0)
      .map(([name, count]) => `${name}:${count}`).join(', ')
    lines.push(`| \`${file.file}\` | ${summary} | ${file.total_signals} | NOT_RUN |`)
  }
  return `${lines.join('\n')}\n`
}

async function writeOutput(destination, content) {
  const absolute = path.resolve(destination)
  await mkdir(path.dirname(absolute), { recursive: true })
  await writeFile(absolute, content, 'utf8')
  return absolute
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const appRoot = path.resolve(options.root)
  const rootStats = await stat(appRoot)
  if (!rootStats.isDirectory()) throw new Error(`Application root is not a directory: ${appRoot}`)

  const files = await walk(appRoot)
  const analyses = []
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    analyses.push(analyzeFile(source, path.relative(appRoot, file).replaceAll('\\', '/')))
  }
  analyses.sort((left, right) => left.file.localeCompare(right.file))
  const routes = analyses.flatMap((file) => file.routes.map((route) => ({ path: route, file: file.file })))
  const inventory = {
    generated_at: new Date().toISOString(),
    app_root: appRoot.replaceAll('\\', '/'),
    files_scanned: analyses.length,
    routes,
    files: analyses
  }

  const json = `${JSON.stringify(inventory, null, 2)}\n`
  const markdown = markdownFor(inventory)
  const written = []
  if (options.json) written.push(await writeOutput(options.json, json))
  if (options.markdown) written.push(await writeOutput(options.markdown, markdown))
  if (written.length === 0) process.stdout.write(json)
  else console.log(`Wrote ${written.join(', ')}`)
}

main().catch((error) => {
  console.error(`inventory-interactions: ${error.message}`)
  process.exitCode = 1
})
