export type PromptCopyResult = { ok: true } | { ok: false; message: string }

export async function copyPromptText(text: string, clipboard: Pick<Clipboard, 'writeText'> | undefined = navigator.clipboard): Promise<PromptCopyResult> {
  if (!clipboard?.writeText) return { ok: false, message: '自动复制失败，请全选下面的内容进行复制' }
  try {
    await clipboard.writeText(text)
    return { ok: true }
  } catch {
    return { ok: false, message: '自动复制失败，请全选下面的内容进行复制' }
  }
}
