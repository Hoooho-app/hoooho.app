function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    if (!paragraph) { lines.push(''); continue }
    let line = ''
    for (const character of paragraph) {
      if (context.measureText(line + character).width > maxWidth && line) { lines.push(line); line = character }
      else line += character
    }
    lines.push(line)
  }
  return lines
}

export function downloadPromptLongImage(prompt: string, filename = 'HOOOHO-健康信息.png') {
  const width = 1080
  const padding = 88
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器无法生成长图')
  context.font = '34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  const lines = wrapText(context, prompt, width - padding * 2)
  const lineHeight = 56
  canvas.width = width
  canvas.height = Math.max(900, padding * 2 + 150 + lines.length * lineHeight)
  context.fillStyle = '#f7faf9'; context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#147d70'; context.font = '700 46px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'; context.fillText('HOOOHO', padding, padding)
  context.fillStyle = '#1d292d'; context.font = '700 38px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'; context.fillText('健康信息整理', padding, padding + 72)
  context.font = '34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  lines.forEach((line, index) => { context.fillText(line, padding, padding + 150 + index * lineHeight) })
  const link = document.createElement('a')
  link.download = filename
  link.href = canvas.toDataURL('image/png')
  link.click()
}
