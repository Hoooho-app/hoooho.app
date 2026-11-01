import ts from 'typescript'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

// Add static source identifiers before JSX is compiled; never use rendered user data as a label.
export function instrumentAnalytics(source, filename) {
  const file = filename.replaceAll('\\', '/').split('/src/')[1]
  if (!file || /(?:^|\/)(?:Ops|ops)(?:\/|\.)/.test(file) || /\.test\./.test(file) || !filename.endsWith('.tsx')) return { code: source, controls: [] }
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const edits = [], controls = [], occurrences = new Map()
  const visit = node => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(ast), attributes = node.attributes.properties
      const hasAttribute = name => attributes.some(attr => ts.isJsxAttribute(attr) && attr.name.getText(ast) === name)
      const nativeDialog = !hasAttribute('data-ha-surface') && attributes.some(attr => ts.isJsxAttribute(attr) && attr.name.getText(ast) === 'role' && attr.initializer && ts.isStringLiteral(attr.initializer) && attr.initializer.text === 'dialog')
      const surface = tag === 'BottomSheetSurface' || nativeDialog
      const interactive = ['button', 'a', 'select', 'summary', 'HohoButton', 'Link', 'NavLink'].includes(tag) || (/^[a-z]/.test(tag) && attributes.some(attr => ts.isJsxAttribute(attr) && ['onClick', 'onPointerDown', 'onMouseDown', 'onTouchStart'].includes(attr.name.getText(ast))))
      const fileInput = tag === 'input' && attributes.some(attr => ts.isJsxAttribute(attr) && attr.name.getText(ast) === 'type' && attr.initializer && ts.isStringLiteral(attr.initializer) && ['file', 'checkbox', 'radio', 'range'].includes(attr.initializer.text))
      if (interactive || fileInput || surface) {
        const literal = name => {
          const attr = attributes.find(attr => ts.isJsxAttribute(attr) && attr.name.getText(ast) === name)
          const value = attr?.initializer
          if (value && ts.isStringLiteral(value)) return value.text
          const expression = value && ts.isJsxExpression(value) ? value.expression : null
          if (expression && ts.isStringLiteral(expression)) return expression.text
          if (expression && ts.isConditionalExpression(expression) && ts.isStringLiteral(expression.whenTrue) && ts.isStringLiteral(expression.whenFalse)) return expression.whenTrue.text + ' / ' + expression.whenFalse.text
          return ''
        }
        let text = ''
        if (ts.isJsxElement(node.parent)) {
          const parts = []
          const staticText = child => {
            if (ts.isJsxText(child)) parts.push(child.text.trim())
            else if (ts.isJsxElement(child)) child.children.forEach(staticText)
          }
          node.parent.children.forEach(staticText)
          text = parts.filter(Boolean).join(' ')
        }
        const surfaceName = file.includes('DietRecordFlow') ? '喂养/饮食' : '操作弹层'
        const genericName = file.includes('HoldToTalkButton') ? '按住说话' : file.includes('DialogueComposer') ? '切换输入方式' : '功能操作'
        const label = (literal('label') || literal('aria-label') || literal('title') || text || (surface ? surfaceName : fileInput ? '选择附件或选项' : tag === 'a' || tag === 'Link' || tag === 'NavLink' ? '页面入口' : genericName)).replace(/\s+/g, ' ').trim().slice(0, 60)
        const signature = `${file}|${tag}|${label}|${literal('href') || literal('to')}`
        const count = (occurrences.get(signature) ?? 0) + 1; occurrences.set(signature, count)
        const id = `c_${createHash('sha256').update(`${signature}|${count}`).digest('hex').slice(0, 18)}`
        controls.push({ id, name: label, component: file.replace(/\.tsx$/, ''), ...(surface ? { surface: true } : {}) })
        const press = attributes.some(attr => ts.isJsxAttribute(attr) && attr.name.getText(ast) === 'onPointerDown')
        edits.push({ at: node.tagName.end, text: surface ? tag === 'BottomSheetSurface' ? ` analyticsId="${id}"` : ` data-ha-surface="${id}"` : ` data-ha-id="${id}"${press ? ' data-ha-press="true"' : ''}` })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  let code = source
  for (const edit of edits.sort((a, b) => b.at - a.at)) code = code.slice(0, edit.at) + edit.text + code.slice(edit.at)
  return { code, controls }
}
export async function analyticsControlCatalog(root = process.cwd()) {
  const result = []
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(file)
      else if (entry.name.endsWith('.tsx')) result.push(...instrumentAnalytics(await readFile(file, 'utf8'), file).controls)
    }
  }
  await walk(path.join(root, 'src'))
  return result
}
export function analyticsInstrumentationPlugin() {
  let root
  return {
    name: 'hoooho-behavior-controls', enforce: 'pre',
    configResolved(config) { root = config.root },
    transform(source, id) { const result = instrumentAnalytics(source, id); return result.code === source ? null : { code: result.code, map: null } },
    async generateBundle() { this.emitFile({ type: 'asset', fileName: 'analytics-controls.json', source: JSON.stringify(await analyticsControlCatalog(root)) }) }
  }
}
