import { dietaryCopy, presentDietaryCard, translateFood, type DietaryCardLanguage, type DietaryCardSnapshot } from './dietaryCardModel'

export interface DietaryCardExportLayout {
  width: number
  height: number
  texts: string[]
  rows: Array<{ group: 'avoid' | 'temporary'; labels: string[]; rowHeights: number[] }>
}

const width = 1200
const columns = 3
const rowGap = 24
const groupBaseHeight = 72

function estimatedItemHeight(label: string) {
  const conservativeLineCount = Math.max(1, Math.ceil(Array.from(label).length / 6))
  return Math.max(102, 32 + conservativeLineCount * 30)
}

function exportRowHeights(labels: string[]) {
  const result: number[] = []
  for (let index = 0; index < labels.length; index += columns) {
    result.push(Math.max(...labels.slice(index, index + columns).map(estimatedItemHeight)) + rowGap)
  }
  return result
}

export function buildDietaryCardExportLayout(snapshot: DietaryCardSnapshot, language: DietaryCardLanguage): DietaryCardExportLayout {
  const copy = dietaryCopy[language]
  const presentation = presentDietaryCard(snapshot, language)
  const rows = ([['avoid', presentation.avoid], ['temporary', presentation.temporary]] as const)
    .filter(([, items]) => items.length)
    .map(([group, items]) => {
      const labels = items.map((item) => translateFood(item, language))
      return { group, labels, rowHeights: exportRowHeights(labels) }
    })
  const groupsHeight = rows.reduce((sum, row) => sum + groupBaseHeight + row.rowHeights.reduce((height, value) => height + value, 0), 0)
  const reminderHeight = snapshot.avoidCrossContact ? 108 : 0
  const height = Math.max(900, 380 + groupsHeight + reminderHeight)
  return {
    width,
    height,
    rows,
    texts: [copy.title, copy.intro, ...rows.flatMap((row) => row.labels), ...(snapshot.avoidCrossContact ? [copy.crossContact] : []), copy.thanks]
  }
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  context.beginPath()
  context.roundRect(x, y, w, h, radius)
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = []
  let line = ''
  for (const character of text) {
    if (context.measureText(line + character).width > maxWidth && line) { lines.push(line); line = character }
    else line += character
  }
  if (line) lines.push(line)
  return lines
}

function drawCenteredLines(context: CanvasRenderingContext2D, text: string, centerX: number, startY: number, maxWidth: number, lineHeight: number) {
  const lines = wrapText(context, text, maxWidth)
  lines.forEach((line, index) => context.fillText(line, centerX, startY + index * lineHeight))
  return lines.length
}

function drawFoodItem(context: CanvasRenderingContext2D, label: string, x: number, y: number, itemWidth: number, itemHeight: number, group: 'avoid' | 'temporary') {
  const background = group === 'avoid' ? '#FFF8F6' : '#FFFBEE'
  const accent = group === 'avoid' ? '#FF7164' : '#F3A70C'
  roundRect(context, x, y, itemWidth, itemHeight, 18)
  context.fillStyle = background
  context.fill()
  context.fillStyle = accent
  context.beginPath()
  context.arc(x + 48, y + itemHeight / 2, 27, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = '#FFFFFF'
  context.font = '600 25px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(label.trim().slice(0, 1), x + 48, y + itemHeight / 2)
  context.fillStyle = '#18312F'
  context.font = '600 26px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
  const lines = wrapText(context, label, itemWidth - 124)
  const lineHeight = 32
  const startY = y + itemHeight / 2 - ((lines.length - 1) * lineHeight) / 2
  lines.forEach((line, index) => context.fillText(line, x + 92 + (itemWidth - 108) / 2, startY + index * lineHeight))
}

export async function createDietaryCardPng(snapshot: DietaryCardSnapshot, language: DietaryCardLanguage) {
  await document.fonts?.ready
  const layout = buildDietaryCardExportLayout(snapshot, language)
  const copy = dietaryCopy[language]
  const canvas = document.createElement('canvas')
  canvas.width = layout.width
  canvas.height = layout.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器无法生成图片')

  context.fillStyle = '#FFFFFF'
  context.fillRect(0, 0, canvas.width, canvas.height)
  roundRect(context, 54, 54, canvas.width - 108, canvas.height - 108, 32)
  context.fillStyle = '#FFFFFF'
  context.fill()
  context.strokeStyle = '#69C9A5'
  context.lineWidth = 4
  context.stroke()

  context.textAlign = 'center'
  context.textBaseline = 'alphabetic'
  context.fillStyle = '#08755F'
  context.font = '700 42px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
  context.fillText('Hoooho', canvas.width / 2, 124)
  context.fillStyle = '#102D2A'
  context.font = '700 54px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
  context.fillText(copy.title, canvas.width / 2, 198)
  context.font = '400 28px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
  context.fillStyle = '#405B57'
  const introLines = drawCenteredLines(context, copy.intro, canvas.width / 2, 250, canvas.width - 220, 40)
  let y = 280 + introLines * 40
  const gap = 18
  const contentX = 82
  const contentWidth = canvas.width - 164
  const itemWidth = (contentWidth - gap * (columns - 1)) / columns

  for (const row of layout.rows) {
    const accent = row.group === 'avoid' ? '#F24B47' : '#C77A00'
    context.fillStyle = row.group === 'avoid' ? '#FF7164' : '#F3A70C'
    context.beginPath()
    context.arc(contentX + 16, y - 7, 13, 0, Math.PI * 2)
    context.fill()
    context.textAlign = 'left'
    context.fillStyle = accent
    context.font = '700 31px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
    context.fillText(row.group === 'avoid' ? copy.avoid : copy.temporary, contentX + 48, y)
    if (row.group === 'temporary') {
      context.fillStyle = '#7A7061'
      context.font = '400 24px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
      context.fillText(copy.pending, contentX + 300, y)
    }
    y += 38
    for (let line = 0; line < row.rowHeights.length; line += 1) {
      const lineHeight = row.rowHeights[line] - rowGap
      row.labels.slice(line * columns, line * columns + columns).forEach((label, column) => {
        drawFoodItem(context, label, contentX + column * (itemWidth + gap), y, itemWidth, lineHeight, row.group)
      })
      y += row.rowHeights[line]
    }
    y += 34
  }

  if (snapshot.avoidCrossContact) {
    roundRect(context, contentX, y, contentWidth, 76, 18)
    context.fillStyle = '#F5F8F6'
    context.fill()
    context.fillStyle = '#526966'
    context.font = '500 26px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
    context.textAlign = 'center'
    context.fillText(copy.crossContact, canvas.width / 2, y + 47)
    y += 106
  }

  context.fillStyle = '#18312F'
  context.font = '500 27px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
  context.textAlign = 'center'
  drawCenteredLines(context, copy.thanks, canvas.width / 2, y + 18, canvas.width - 200, 38)

  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('图片生成失败')), 'image/png'))
}

export async function downloadDietaryCard(snapshot: DietaryCardSnapshot, language: DietaryCardLanguage) {
  const blob = await createDietaryCardPng(snapshot, language)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)
  link.download = `Hoooho_忌口出示卡_${date}.png`
  link.href = url
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return blob
}
