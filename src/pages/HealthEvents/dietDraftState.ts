import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

export function dietDraftScope(accountId: string, memberId: string) {
  return `hoooho:diet-draft:${encodeURIComponent(accountId)}:${encodeURIComponent(memberId)}`
}
export function useDietDraftState<T>(key: string | undefined, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value,setValue] = useState<T>(() => {
    try { const saved = key ? sessionStorage.getItem(key) : null; return saved ? JSON.parse(saved) as T : initial } catch { return initial }
  })
  useEffect(() => { try { if(key) { if(value===undefined) sessionStorage.removeItem(key); else sessionStorage.setItem(key,JSON.stringify(value)) } } catch { /* In-memory drafts remain editable. */ } },[key,value])
  return [value,setValue]
}
