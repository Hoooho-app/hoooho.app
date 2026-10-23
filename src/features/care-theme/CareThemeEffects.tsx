import { PRODUCT_FEATURES } from '../../../shared/product-visibility.mjs'
import { useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'
import './careTheme.css'

export function CareThemeEffects() {
  const token=useAppStore(s=>s.authToken),accountId=useAppStore(s=>s.authUser?.id??'')
  useEffect(()=>{
    const root=document.documentElement,controller=new AbortController()
    root.dataset.careTheme='paper'
    const apply=(value:unknown)=>{
      root.dataset.careTheme=value==='mist-blue'?'mist-blue':'paper'
      const channels=getComputedStyle(root).getPropertyValue('--hoho-color-page-background').trim().split(/\s+/).map(Number)
      const meta=document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      if(meta&&channels.length===3&&channels.every(Number.isFinite))meta.content=`#${channels.map(c=>c.toString(16).padStart(2,'0')).join('')}`
    }
    apply('paper')
    if (!PRODUCT_FEATURES.careJourney) return () => { controller.abort(); root.dataset.careTheme='paper' }
    const changed=(event:Event)=>apply((event as CustomEvent<{theme?:string}>).detail?.theme)
    window.addEventListener('hoooho-care-theme-changed',changed)
    if(token)void fetch('/api/care-journey/theme',{headers:{Authorization:`Bearer ${token}`},credentials:'same-origin',signal:controller.signal}).then(async response=>{
      if(!response.ok)return
      const value=await response.json();if(!controller.signal.aborted)apply(value.active??value.theme?.active??value.theme)
    }).catch(()=>undefined)
    return()=>{controller.abort();window.removeEventListener('hoooho-care-theme-changed',changed);root.dataset.careTheme='paper'}
  },[accountId,token])
  return null
}
