// Match the account avatar: use the recorder's actual first character.
export function userInitial(name?: string | null) {
  return name?.trim().slice(0, 1) || '用'
}
