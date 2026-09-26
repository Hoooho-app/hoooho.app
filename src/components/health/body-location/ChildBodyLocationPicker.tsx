import { ArrowLeft, Check, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BottomSheetSurface, HohoButton } from '../../design-system'
import type { BodyLocationSelection } from '../../../features/body-location'
import { getBodyLocationRegions, toBodyLocationSelection } from '../../../features/body-location'
import { availableChildRegions, CHILD_LOCATIONS, CHILD_REGIONS, childSelectionKey, confirmChildSelection, isChildSelection, resolveChildModel, toggleChildSelection, type ChildLocation, type ChildView } from '../../../features/body-location/childBodyCatalog'
import { localAngles, type LocalAngle } from '../../../features/body-location/childBodyGeometry'
import { ownChildBodyHistory } from '../../../features/body-location/childBodyHistory'
import { familyMemberService } from '../../../services/familyMembers'
import { useAppStore } from '../../../store/useAppStore'
import { ChildBodyStage } from './ChildBodyStage'
import './child-body-location.css'

interface Props { memberId: string; value: BodyLocationSelection[]; onChange: (values: BodyLocationSelection[]) => void; buttonLabel?: string; confirmLabel?: string; showCommitted?: boolean }
interface LocatorHistory { id: string; regionId: string; depth: number }

export function ChildBodyLocationPicker({ memberId, value, onChange, buttonLabel, confirmLabel = '完成并返回症状记录', showCommitted = true }: Props) {
  const token = useAppStore(state=>state.authToken ?? '')
  const cached = useAppStore(state=>state.members.find(member=>member.id === memberId))
  const [profile, setProfile] = useState<{id:string; name:string; gender: unknown}|null>(null)
  const [profileStatus, setProfileStatus] = useState<'loading'|'ready'|'error'>('loading')
  const [open,setOpen] = useState(false), [draft,setDraft] = useState<BodyLocationSelection[]>([])
  const [regionId,setRegionId] = useState(''), [view,setView] = useState<ChildView>('front'), [angle,setAngle] = useState<LocalAngle>('palm')
  const [query,setQuery] = useState(''), [notice,setNotice] = useState('')
  const openedMemberId = useRef(''), instance = useRef(crypto.randomUUID()), container = useRef<HTMLDivElement>(null)
  const profileVersion = useRef(0)
  const releaseHistory = useRef<(() => void) | undefined>(undefined)
  const historyMoving = useRef(false)
  const member = profile?.id === memberId ? profile : cached
  const model = resolveChildModel(member?.gender)
  const region = CHILD_REGIONS.find(item=>item.id === regionId)
  const legacyRegion = getBodyLocationRegions({gender:model==='girl'?'female':model==='boy'?'male':'undisclosed',age:''}).find(item=>`legacy:${item.id}`===regionId)
  const historyEntry = () => window.history.state?.childBodyLocator as LocatorHistory | undefined
  const refreshProfile = () => {
    const version = ++profileVersion.current
    setProfileStatus('loading')
    void familyMemberService.getById(memberId,token).then(result=>{
      if (version === profileVersion.current) { setProfile(result); setProfileStatus('ready') }
    }).catch(()=>{if (version === profileVersion.current) setProfileStatus('error')})
  }
  const begin = () => {
    historyMoving.current = false
    openedMemberId.current = memberId
    setDraft(value.map(item=>({...item}))); setRegionId(''); setView('front'); setAngle('palm'); setQuery(''); setNotice('')
    window.history.replaceState({...window.history.state,childBodyLocatorBase:instance.current},'')
    releaseHistory.current = ownChildBodyHistory(event => {
      historyMoving.current = false
      const entry = event.state?.childBodyLocator as LocatorHistory | undefined
      if (entry?.id === instance.current) { setRegionId(entry.regionId); return true }
      const ownBase = event.state?.childBodyLocatorBase === instance.current
      if (ownBase) {
        const { childBodyLocatorBase: _base, ...state } = event.state
        window.history.replaceState(state,'')
      }
      setOpen(false); releaseHistory.current?.(); releaseHistory.current = undefined
      return ownBase
    })
    window.history.pushState({...window.history.state,childBodyLocator:{id:instance.current,regionId:'',depth:1}},'')
    setOpen(true)
  }
  const close = () => {
    if (historyMoving.current) return
    const entry = historyEntry()
    if (entry?.id===instance.current) { historyMoving.current = true; window.history.go(-entry.depth) }
    else { setOpen(false); releaseHistory.current?.(); releaseHistory.current = undefined }
  }
  const enterRegion = (id: string) => {
    if (historyMoving.current) return
    const next = CHILD_REGIONS.find(item=>item.id===id)
    if (next && !next.views.includes(view)) setView(next.views[0])
    setAngle(next?.zoom === 'hand' ? 'palm' : 'dorsal'); setRegionId(id); setQuery('')
    const entry = historyEntry()
    const state = {...window.history.state, childBodyLocator:{id:instance.current,regionId:id,depth:2}}
    if (entry?.depth===2) window.history.replaceState(state,'')
    else window.history.pushState(state,'')
  }
  const back = () => { if (historyMoving.current) return; if (regionId) { historyMoving.current = true; window.history.back() } else close() }
  const actions = useRef({back,close}); actions.current = {back,close}
  useEffect(()=>{
    if (!open) return
    if (openedMemberId.current !== memberId) { actions.current.close(); return }
    refreshProfile()
    const refresh = () => refreshProfile()
    const key = (event: KeyboardEvent) => {if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();actions.current.back()}}
    document.addEventListener('keydown',key,true); window.addEventListener('focus',refresh)
    return ()=>{profileVersion.current++;document.removeEventListener('keydown',key,true);window.removeEventListener('focus',refresh)}
  // The open session owns its captured child and history entries; browsing state is deliberately separate.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open,memberId,token])
  useEffect(()=>()=>{releaseHistory.current?.()},[])
  useEffect(()=>{const body=container.current?.closest('.hoho-bottom-sheet__body');if(body)body.scrollTop=0},[regionId])
  const selectedIds = draft.filter(item=>isChildSelection(item)&&model&&CHILD_LOCATIONS.get(item.id)!.sex.includes(model)).map(item=>item.id)
  const toggle = (id:string) => {
    if(!model) return
    setDraft(current=>{
      const next = toggleChildSelection(current,id,model)
      if(next.length>20){setNotice('每次最多选择20个部位，可先移除已有部位。');return current}
      setNotice('');return next
    })
  }
  const toggleLegacy = (id:string) => {
    const item=legacyRegion?.options.find(item=>item.id===id)
    if(!item)return
    setDraft(current=>{
      const next=current.some(old=>!old.schemaVersion&&old.id===id)?current.filter(old=>old.schemaVersion||old.id!==id):[...current,toBodyLocationSelection(item)]
      if(next.length>20){setNotice('每次最多选择20个部位，可先移除已有部位。');return current}
      setNotice('');return next
    })
  }
  const groups = new Map<string, ChildLocation[]>()
  region?.items.filter(item=>model&&item.sex.includes(model)).forEach(item=>groups.set(item.group,[...(groups.get(item.group)??[]),item]))
  const applicable = model ? availableChildRegions(model) : []
  const search = query.trim().toLowerCase()
  const shownRegions = applicable.filter(item=>!search||[item.label,...item.items.filter(location=>model&&location.sex.includes(model)).flatMap(location=>[location.label,...location.aliases])].some(text=>text.toLowerCase().includes(search)))
  const legacyValues = draft.filter(item=>!isChildSelection(item)||model&&!CHILD_LOCATIONS.get(item.id)!.sex.includes(model))
  const confirm = () => {if(historyMoving.current)return;try{onChange(confirmChildSelection(draft,openedMemberId.current,memberId));close()}catch(reason){setNotice((reason as Error).message)}}
  return <div className="child-body-picker">
    <button className="body-location-picker-action child-body-open" onClick={begin} type="button">{buttonLabel ?? (value.length ? '修改部位' : '选择部位')}</button>
    {showCommitted && value.length>0 && <div className="child-body-committed" aria-label="已选择的症状部位">{value.map(item=><span key={childSelectionKey(item)}><Check size={15}/>{item.label}</span>)}</div>}
    {open && createPortal(<BottomSheetSurface className="body-location-sheet child-body-sheet" layerClassName="child-body-layer" label="身体部位定位器" title="选择身体部位" leading={<button aria-label={regionId?'返回全身':'取消选择'} className="hoho-bottom-sheet__back" onClick={back} type="button"><ArrowLeft size={20}/></button>} onClose={close} open size="workspace"
      navigation={<div className="child-body-navigation"><p>当前孩子 · {member?.name ?? '正在读取'}</p>{model && <div role="group" aria-label="身体视图" className="child-body-segments">{(['front','back'] as const).map(next=><button aria-pressed={view===next} key={next} type="button" onClick={()=>{setView(next);if(region&&!region.views.includes(next))window.history.back()}}>{next==='front'?'正面':'背面'}</button>)}</div>}</div>}
      footer={<div className="child-body-footer"><div className="child-body-selection-heading"><span aria-live="polite">已选 {draft.length} 个部位</span><button disabled={!draft.length} onClick={()=>{setDraft([]);setNotice('')}} type="button">清空全部</button></div>{draft.length>0&&<div className="child-body-chips" aria-label="本次已选部位">{draft.map((item,index)=><span key={childSelectionKey(item)}><Check size={14}/><span>{index+1}. {item.label}</span><button aria-label={`移除${item.label}`} onClick={()=>setDraft(current=>current.filter(old=>childSelectionKey(old)!==childSelectionKey(item)))} type="button"><X size={15}/></button></span>)}</div>}{notice&&<p role="alert">{notice}</p>}<HohoButton onClick={confirm} type="button"><Check size={17}/>{confirmLabel}</HohoButton></div>}>
      <div ref={container} className="child-body-content">
        {profileStatus==='loading'&&!model ? <p role="status">正在读取孩子档案…</p> : profileStatus==='error' ? <div className="child-body-profile-notice" role="alert"><p>孩子档案暂时无法读取，已选部位已保留。</p><button onClick={refreshProfile} type="button">重试读取档案</button></div> : !model ? <div className="child-body-profile-notice"><p>请先补全孩子档案中的性别，以显示对应的身体模型。</p><a href={`/family/${encodeURIComponent(memberId)}/edit`} target="_blank" rel="noopener">补全孩子档案</a><p>档案在新页面打开，当前症状、附件和定位草稿会保留。返回后自动更新。</p><button onClick={refreshProfile} type="button">已补全，重新读取</button></div> : <>
          {region ? <>
            <div className="child-body-region-heading"><h3>全身 › {region.label}</h3><button onClick={back} type="button">返回全身</button></div>
            {localAngles(region).length>0&&<div className="child-body-segments" aria-label={`${region.label}查看角度`} role="group">{localAngles(region).map(item=><button key={item.id} aria-pressed={angle===item.id} onClick={()=>setAngle(item.id)} type="button">{item.label}</button>)}</div>}
            <ChildBodyStage model={model} view={view} region={region} angle={angle} selectedIds={selectedIds} selectionNumbers={Object.fromEntries(draft.flatMap((item,index)=>isChildSelection(item)?[[item.id,index+1]]:[]))} onRegion={enterRegion} onToggle={toggle}/>
            <p className="child-body-help">点具体名称即选中，再点取消。</p>
            {[...groups].sort(([a],[b])=>Number(a==='整体与其他')-Number(b==='整体与其他')).map(([group,items])=><section className="child-body-option-group" key={group}><h4>{group}</h4><div className="child-body-options">{items.map(item=><button data-location-id={item.id} aria-pressed={selectedIds.includes(item.id)} key={item.id} type="button" onClick={()=>toggle(item.id)}><span>{item.label}</span>{selectedIds.includes(item.id)&&<Check size={16}/>}</button>)}</div></section>)}
          </> : legacyRegion ? <><div className="child-body-region-heading"><h3>{legacyRegion.label}</h3><button onClick={back} type="button">返回全身</button></div><div className="child-body-options">{legacyRegion.options.map(item=><button key={item.id} type="button" aria-pressed={draft.some(old=>!old.schemaVersion&&old.id===item.id)} onClick={()=>toggleLegacy(item.id)}><span>{item.label}</span>{draft.some(old=>!old.schemaVersion&&old.id===item.id)&&<Check size={16}/>}</button>)}</div></> : <>
            <div className="child-body-region-heading"><h3>先选一个大部位</h3><button type="button" onClick={()=>container.current?.querySelector('#child-body-regions')?.scrollIntoView({block:'start'})}>全部区域 ↓</button></div>
            {!search&&<ChildBodyStage model={model} view={view} selectedIds={selectedIds} selectionNumbers={Object.fromEntries(draft.flatMap((item,index)=>isChildSelection(item)?[[item.id,index+1]]:[]))} onRegion={enterRegion} onToggle={toggle}/>}
            <section id="child-body-regions"><h3>全部身体区域 · {applicable.length}</h3><label className="child-body-search"><Search size={18}/><input aria-label="搜索部位" placeholder="搜索部位" value={query} onChange={event=>setQuery(event.target.value)}/></label><div className="child-body-options child-body-regions">{shownRegions.map(item=><button type="button" key={item.id} data-region-id={item.id} aria-expanded={false} onClick={()=>enterRegion(item.id)}><span>{item.label}</span>{item.items.some(location=>selectedIds.includes(location.id))&&<Check size={16}/>}</button>)}</div>{!shownRegions.length&&<p>没有找到相关部位，可修改搜索内容。</p>}</section>
            <div className="child-body-options child-body-existing"><button type="button" onClick={()=>enterRegion('legacy:internal_organs')}>器官（原有选项）</button><button type="button" onClick={()=>enterRegion('legacy:general')}>全身／说不清</button></div>
          </>}
        </>}
        {legacyValues.length>0&&<p className="child-body-legacy-note">原有部位信息已保留；旧图位置或与当前模型不一致的部位仅显示名称，请按需要核对。</p>}
      </div>
    </BottomSheetSurface>,document.body)}
  </div>
}
