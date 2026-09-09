const invisiblePattern = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u
const allowedPattern = /^[\p{L}\p{N}]+$/u

export function normalizeNickname(value) {
  return String(value ?? '').normalize('NFKC').trim()
}

export function nicknameKey(value) {
  return normalizeNickname(value).toLocaleLowerCase('en-US')
}

export function isValidNickname(value) {
  const nickname = normalizeNickname(value)
  return nickname.length >= 1 && nickname.length <= 20 && !invisiblePattern.test(nickname) && allowedPattern.test(nickname)
}
