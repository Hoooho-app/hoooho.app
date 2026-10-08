export const NURSE_GREETING = '你好，我是 Hoooho 的值班护士，帮你整理本次记录，不代替医生问诊。收起会暂停语音并保留对话，再次打开可以继续。孩子哪里不舒服？你可以直接跟我说。'
const LEGACY_NURSE_GREETING = '你好，我是 Hoooho 的值班 AI 护士，可以帮你理清这次的症状并整理成记录。孩子哪里不舒服？你可以直接跟我说。'

// Refresh only the known opening copy; keep historical conversation text intact.
export function nurseGreetingText(text, index) {
  return index === 0 && text === LEGACY_NURSE_GREETING ? NURSE_GREETING : text
}
