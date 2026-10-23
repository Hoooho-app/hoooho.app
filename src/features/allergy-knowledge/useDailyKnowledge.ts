import { PRODUCT_FEATURES } from '../../../shared/product-visibility.mjs'
import { useEffect, useState } from 'react'
import { getKnowledgeStorage, nextKnowledgeUpdate, readDailyKnowledge } from './daily'

export function useDailyKnowledge(accountId: string) {
  const [article, setArticle] = useState(() => PRODUCT_FEATURES.careJourney ? readDailyKnowledge(accountId, new Date(), getKnowledgeStorage()) : null)
  useEffect(() => {
    if (!PRODUCT_FEATURES.careJourney) return
    let timer: number
    const refresh = () => {
      window.clearTimeout(timer)
      const now = new Date()
      setArticle(readDailyKnowledge(accountId, now, getKnowledgeStorage()))
      timer = window.setTimeout(refresh, nextKnowledgeUpdate(now).getTime() - now.getTime() + 50)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
    }
  }, [accountId])
  return article
}
