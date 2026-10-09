export function dialogueImage(value) {
  if (value === undefined) return undefined
  const invalid = () => Object.assign(new Error('图片无法读取，请选择不超过 2MB 的 JPG 截图'), { status: 400, code: 'DIALOGUE_IMAGE_INVALID' })
  if (typeof value !== 'string' || value.length > 2_800_000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw invalid()
  const bytes = Buffer.from(value.split(',')[1], 'base64')
  if (bytes.length < 100 || bytes.length > 2 * 1024 * 1024 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) throw invalid()
  return value
}
