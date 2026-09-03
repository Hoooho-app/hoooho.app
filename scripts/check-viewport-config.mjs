import { readFile } from 'node:fs/promises'

const builtHtml = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8')
const viewportTags = builtHtml.match(/<meta\s+[^>]*name=["']viewport["'][^>]*>/gi) ?? []

if (viewportTags.length !== 1) {
  throw new Error('Expected exactly one viewport meta tag in dist/index.html, found ' + viewportTags.length)
}

const contentMatch = viewportTags[0].match(/content=["']([^"']+)["']/i)
if (!contentMatch) {
  throw new Error('Viewport meta tag in dist/index.html has no content attribute')
}

const directives = new Set(contentMatch[1].split(',').map((value) => value.trim()))
const requiredDirectives = [
  'width=device-width',
  'initial-scale=1',
  'minimum-scale=1',
  'maximum-scale=1',
  'user-scalable=no',
  'viewport-fit=cover'
]
const missingDirectives = requiredDirectives.filter((directive) => !directives.has(directive))

if (missingDirectives.length > 0) {
  throw new Error('Built viewport meta tag is missing: ' + missingDirectives.join(', '))
}

console.log('Viewport build check passed: ' + contentMatch[1])
