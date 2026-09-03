import type { ConsultationSummary } from './consultationSummary'

export type ConsultationSummarySaveMode = 'downloaded' | 'opened'

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    if (!paragraph) { lines.push(''); continue }
    let line = ''
    for (const character of paragraph) {
      if (line && context.measureText(line + character).width > maxWidth) { lines.push(line); line = character }
      else line += character
    }
    lines.push(line)
  }
  return lines
}

const cssRgb = (name: string, fallback: string) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value ? `rgb(${value})` : fallback
}

const canvasToBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('长图生成失败，请稍后重试')), 'image/png')
})

export async function saveConsultationSummaryLongImage(summary: ConsultationSummary): Promise<ConsultationSummarySaveMode> {
  const width = 1080
  const padding = 80
  const contentWidth = width - padding * 2
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器无法生成长图')

  context.font = '34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  const sectionLines = summary.sections.map((section) => ({
    ...section,
    wrapped: section.lines.flatMap((line) => wrapText(context, `• ${line}`, contentWidth)),
  }))
  const lineHeight = 54
  const sectionsHeight = sectionLines.reduce((height, section) => height + 76 + section.wrapped.length * lineHeight + 30, 0)
  canvas.width = width
  canvas.height = Math.max(1180, padding * 2 + 270 + sectionsHeight + 110)

  const primary = cssRgb('--hoho-color-primary', 'rgb(27 122 110)')
  const textPrimary = cssRgb('--hoho-color-text-primary', 'rgb(24 49 47)')
  const textSecondary = cssRgb('--hoho-color-text-secondary', 'rgb(86 105 102)')
  const border = cssRgb('--hoho-color-border', 'rgb(222 231 228)')
  const surface = cssRgb('--hoho-color-surface', 'rgb(255 255 255)')

  context.fillStyle = surface
  context.fillRect(0, 0, canvas.width, canvas.height)
  let y = padding
  context.fillStyle = primary
  context.font = '700 44px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  context.fillText('Hoooho', padding, y + 42)
  y += 92
  context.fillStyle = textPrimary
  context.font = '700 52px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  context.fillText('问诊摘要', padding, y + 50)
  y += 88
  context.fillStyle = textSecondary
  context.font = '30px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  context.fillText(`${summary.memberName}｜生成于 ${summary.generatedAt}`, padding, y + 30)
  y += 72
  context.strokeStyle = border
  context.lineWidth = 2
  context.beginPath(); context.moveTo(padding, y); context.lineTo(width - padding, y); context.stroke()
  y += 28

  for (const section of sectionLines) {
    context.fillStyle = textPrimary
    context.font = '600 36px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    context.fillText(section.title, padding, y + 36)
    y += 66
    context.fillStyle = textSecondary
    context.font = '32px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    for (const line of section.wrapped) {
      context.fillText(line, padding, y + 32)
      y += lineHeight
    }
    y += 30
  }

  context.strokeStyle = border
  context.beginPath(); context.moveTo(padding, canvas.height - 108); context.lineTo(width - padding, canvas.height - 108); context.stroke()
  context.fillStyle = textSecondary
  context.font = '28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  context.fillText('信息由照护者记录，仅供沟通参考', padding, canvas.height - 54)

  const blob = await canvasToBlob(canvas)
  canvas.width = 1
  canvas.height = 1
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const inWeChat = /MicroMessenger/i.test(navigator.userAgent)
  link.href = url
  link.download = inWeChat ? '' : `Hoooho-问诊摘要-${summary.memberName}.png`
  if (inWeChat) link.target = '_blank'
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return inWeChat ? 'opened' : 'downloaded'
}
