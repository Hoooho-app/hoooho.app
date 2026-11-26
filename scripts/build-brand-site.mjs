import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import React from 'react'
import { renderToString } from 'react-dom/server'
import react from '@vitejs/plugin-react'
import { build, createServer } from 'vite'

const pages = [
  { name: 'family', view: 'home' },
  { name: 'cards', view: 'cards' }
]
const common = {
  configFile: false,
  publicDir: false,
  css: { postcss: { plugins: [] } },
  plugins: [react()]
}

// The brand has its own JS and CSS. Its pages can also be read without JS.
await build({
  ...common,
  build: {
    emptyOutDir: false,
    assetsDir: 'family-site/ui',
    rollupOptions: { input: pages.map(page => `family-site/${page.name}.html`) }
  }
})
const renderer = await createServer({
  ...common,
  optimizeDeps: { noDiscovery: true, include: [], entries: [] },
  server: { middlewareMode: true, hmr: false, watch: null, preTransformRequests: false },
  appType: 'custom'
})
try {
  const { default: App } = await renderer.ssrLoadModule('/brand-site/src/App.tsx')
  for (const { name, view } of pages) {
    const filename = path.join('dist', 'family-site', name + '.html')
    const template = await readFile(filename, 'utf8')
    const marker = '<div id="brand-root" data-page="' + view + '"></div>'
    if (!template.includes(marker)) throw new Error('Missing brand root in ' + filename)
    const markup = renderToString(React.createElement(App, { page: view }))
    await writeFile(filename, template.replace(marker, () => '<div id="brand-root" data-page="' + view + '">' + markup + '</div>'))
  }
} finally {
  await renderer.close()
}
