import { ArrowLeft, Check, Search, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BottomSheetSurface, HohoButton } from '../../design-system'
import { useDialogFocus } from '../../../hooks/useDialogFocus'
import { getBodyLocationRegions, toBodyLocationSelection, type BodyLocationSelection } from '../../../features/body-location'
import { CHILD_LOCATIONS, childSelectionKey, confirmChildSelection, resolveChildModel, type ChildView } from '../../../features/body-location/childBodyCatalog'
import { localAngles, type Bounds, type LocalAngle } from '../../../features/body-location/childBodyGeometry'
import { LOCATOR_CATEGORIES, applicableLocation, bodyLocationLabel, coarseSelection, drawableSelectionIds, locatorRegion, locatorSelection, toggleLocatorSelection, categoryId as unifiedId, type LocatorSide } from '../../../features/body-location/locatorDictionary'
import { ownChildBodyHistory } from '../../../features/body-location/childBodyHistory'
import { familyMemberService } from '../../../services/familyMembers'
import { useAppStore } from '../../../store/useAppStore'
import { LocatorStage } from './LocatorStage'
import './child-body-location.css'

interface Props { memberId:string; value:BodyLocationSelection[]; onChange:(values:BodyLocationSelection[])=>void; buttonLabel?:string; confirmLabel?:string; showCommitted?:boolean }
type Drawer='selected'|'text'|'more'|'discard'|'clear'|null
function DrawerPanel({title,children,onClose,confirmation=false}:{title:string;children:ReactNode;onClose:()=>void;confirmation?:boolean}) {
  const ref=useRef<HTMLElement>(null);useDialogFocus(true,ref)
  return <div className="locator-drawer-layer"><button type="button" className="locator-drawer-backdrop" aria-label={`收起${title}`} onClick={onClose}/><section className="locator-drawer" role={confirmation?'alertdialog':'dialog'} aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}><header><h3>{title}</h3><button type="button" aria-label={`关闭${title}`} onClick={onClose}><X size={20}/></button></header>{children}</section></div>
}
export function ChildBodyLocationPicker({memberId,value,onChange,buttonLabel,confirmLabel='完成并返回症状记录',showCommitted=true}:Props) {
  const token=useAppStore(s=>s.authToken??''),cached=useAppStore(s=>s.members.find(m=>m.id===memberId))
  const [profile,setProfile]=useState<{id:string;name:string;gender:unknown}|null>(null),[profileStatus,setProfileStatus]=useState<'loading'|'ready'|'error'>('loading')
  const [open,setOpen]=useState(false),[draft,setDraft]=useState<BodyLocationSelection[]>([])
  const [categoryId,setCategoryId]=useState(''),[side,setSide]=useState<LocatorSide>(''),[view,setView]=useState<ChildView>('front'),[angle,setAngle]=useState<LocalAngle>('palm')
  const [drawer,setDrawer]=useState<Drawer>(null),[overflow,setOverflow]=useState<string[]>([]),[query,setQuery]=useState(''),[notice,setNotice]=useState(''),[zoom,setZoom]=useState<Bounds|null>(null)
  const initial=useRef(''),openedMember=useRef(''),instance=useRef(crypto.randomUUID()),release=useRef<(()=>void)|undefined>(),allowExit=useRef(false),moving=useRef(false),session=useRef<HTMLDivElement>(null),profileVersion=useRef(0)
  const opener=useRef<HTMLElement|null>(null),drawerTrigger=useRef<HTMLElement|null>(null)
  const member=profile?.id===memberId?profile:cached,model=resolveChildModel(member?.gender)??'neutral'
  const category=LOCATOR_CATEGORIES.find(c=>c.id===categoryId),region=locatorRegion(category,side)
  const legacyRegion=getBodyLocationRegions({gender:model==='girl'?'female':model==='boy'?'male':'undisclosed',age:''}).find(r=>`legacy:${r.id}`===categoryId)
  const dirty=JSON.stringify(draft)!==initial.current
  const refreshProfile=()=>{
    const version=++profileVersion.current;setProfileStatus('loading')
    void familyMemberService.getById(memberId,token).then(result=>{if(profileVersion.current===version){setProfile(result);setProfileStatus('ready')}}).catch(()=>{if(profileVersion.current===version)setProfileStatus('error')})
  }
  const end=()=>{setOpen(false);setDrawer(null);release.current?.();release.current=undefined;moving.current=false;requestAnimationFrame(()=>{if(opener.current?.isConnected)opener.current.focus({preventScroll:true})})}
  const finishExit=()=>{
    if(moving.current)return
    allowExit.current=true
    if(window.history.state?.childBodyLocator?.id===instance.current){moving.current=true;window.history.back()}else end()
  }
  const requestClose=()=>{if(dirty)setDrawer('discard');else finishExit()}
  const back=()=>{
    if(drawer){setDrawer(drawer==='clear'?'selected':null);return}
    if(zoom){setZoom(null);return}
    if(categoryId){setCategoryId('');setSide('');setQuery('');return}
    requestClose()
  }
  const actions=useRef({back,end,dirty,drawer,zoom,categoryId});actions.current={back,end,dirty,drawer,zoom,categoryId}
  const begin=()=>{
    opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;drawerTrigger.current=null
    openedMember.current=memberId;const cloned=value.map(item=>({...item}));initial.current=JSON.stringify(cloned);setDraft(cloned)
    setCategoryId('');setSide('');setView('front');setAngle('palm');setDrawer(null);setNotice('');setQuery('');setZoom(null);allowExit.current=false;moving.current=false
    window.history.replaceState({...window.history.state,childBodyLocatorBase:instance.current},'')
    const state={...window.history.state,childBodyLocator:{id:instance.current}}
    release.current=ownChildBodyHistory(event=>{
      moving.current=false
      const own=event.state?.childBodyLocatorBase===instance.current
      if(event.state?.childBodyLocator?.id===instance.current)return true
      if(allowExit.current){if(own){const {childBodyLocatorBase:_base,...rest}=event.state;window.history.replaceState(rest,'')}actions.current.end();return own}
      // Restore the owned modal entry before handling a draft or an internal return.
      window.history.pushState(state,'')
      const current=actions.current
      if(current.drawer||current.zoom||current.categoryId)current.back()
      else if(current.dirty)setDrawer('discard')
      else{allowExit.current=true;moving.current=true;window.history.back()}
      return true
    })
    window.history.pushState(state,'');setOpen(true)
  }
  useEffect(()=>{
    if(!open)return
    if(openedMember.current!==memberId){allowExit.current=true;finishExit();return}
    refreshProfile()
    const onFocus=()=>refreshProfile(),onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();actions.current.back()}}
    document.addEventListener('keydown',onKey,true);window.addEventListener('focus',onFocus)
    const background=Array.from(document.body.children).filter(el=>el!==session.current&&el instanceof HTMLElement) as HTMLElement[]
    const old=background.map(el=>el.inert);background.forEach(el=>{el.inert=true})
    return()=>{profileVersion.current++;document.removeEventListener('keydown',onKey,true);window.removeEventListener('focus',onFocus);background.forEach((el,i)=>{el.inert=old[i]})}
  // The captured member owns this session; authentication refresh does not reset the draft.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open,memberId,token])
  useEffect(()=>{
    const sheet=session.current?.querySelector<HTMLElement>('.child-body-sheet')
    if(!sheet)return
    if(drawer&&!drawerTrigger.current&&document.activeElement instanceof HTMLElement&&sheet.contains(document.activeElement))drawerTrigger.current=document.activeElement
    sheet.inert=Boolean(drawer)
    if(!drawer&&drawerTrigger.current){const trigger=drawerTrigger.current;drawerTrigger.current=null;requestAnimationFrame(()=>{if(trigger.isConnected)trigger.focus({preventScroll:true});else sheet.querySelector<HTMLElement>('.hoho-bottom-sheet__back')?.focus({preventScroll:true})})}
  },[drawer])
  useEffect(()=>()=>release.current?.(),[])
  const enter=(id:string,restore?:BodyLocationSelection)=>{
    const c=LOCATOR_CATEGORIES.find(c=>c.id===id),knownSide=restore&&CHILD_LOCATIONS.get(restore.id)?.regionId.match(/_(left|right)$/)?.[1]
    const nextSide:LocatorSide=restore?.laterality==='left'||restore?.laterality==='right'?restore.laterality:knownSide==='left'||knownSide==='right'?knownSide:''
    const r=locatorRegion(c,nextSide),v=restore?.view==='back'?'back':restore?.view==='front'?'front':view
    setCategoryId(id);setSide(nextSide);setDrawer(null);setQuery('');setZoom(null);setView(r&&!r.views.includes(v)?r.views[0]:v)
    setAngle(restore?.surface==='dorsal'?'dorsal':restore?.surface==='plantar'?'plantar':c?.id==='foot'?'dorsal':'palm')
  }
  const choose=(next:BodyLocationSelection)=>setDraft(current=>{const result=toggleLocatorSelection(current,next);if(result.length>20){setNotice('每次最多选择20个部位，请先移除已有部位。');return current}setNotice('');return result})
  const toggle=(id:string)=>choose({...locatorSelection(id,model),view:region?.zoom==='hand'?(angle==='palm'?'palm':'dorsum'):region?.zoom==='foot'?(angle==='plantar'?'sole':'front'):view})
  const confirm=()=>{if(moving.current)return;try{const result=confirmChildSelection(draft,openedMember.current,memberId);initial.current=JSON.stringify(result);onChange(result);finishExit()}catch(error){setNotice((error as Error).message)}}
  const selectedIds=drawableSelectionIds(draft),textItems=region?.items.filter(item=>applicableLocation(item,model))??[]
  const groups=new Map<string,typeof textItems>();textItems.filter(item=>!query.trim()||[item.label,...item.aliases].some(s=>s.includes(query.trim()))).forEach(item=>groups.set(item.group,[...(groups.get(item.group)??[]),item]))
  return <div className="child-body-picker"><button className="body-location-picker-action child-body-open" type="button" onClick={begin}>{buttonLabel??(value.length?'修改部位':'选择部位')}</button>
    {showCommitted&&value.length>0&&<div className="child-body-committed" aria-label="已选择的症状部位">{value.map(item=><span key={childSelectionKey(item)}><Check size={15}/>{bodyLocationLabel(item)}</span>)}</div>}
    {open&&createPortal(<div ref={session} className="locator-session"><BottomSheetSurface className="body-location-sheet child-body-sheet" layerClassName="child-body-layer" label="身体部位定位器" title="选择身体部位" leading={<button type="button" className="hoho-bottom-sheet__back" aria-label={categoryId?'返回全身':'取消选择'} onClick={back}><ArrowLeft size={20}/></button>} onClose={requestClose} open size="workspace"
      footer={<div className="child-body-footer"><div className="locator-selected-line"><span aria-live="polite">已选 {draft.length} 处{draft.length>0&&<span className="locator-recent"> · {bodyLocationLabel(draft.at(-1)!)}</span>}</span><button type="button" onClick={()=>setDrawer('selected')}>查看全部</button></div>{notice&&<span className="locator-notice" role="alert">{notice}</span>}<HohoButton type="button" onClick={confirm}><Check size={17}/>{draft.length?`${confirmLabel}（${draft.length}处）`:'完成，暂不选择'}</HohoButton></div>}>
      <div className="locator-workspace"><div className="locator-context"><strong>{region?.label??category?.label??legacyRegion?.label??'全身定位'}</strong><span>左右按孩子自身</span></div>
        {profileStatus==='error'&&<button className="locator-profile-error" type="button" onClick={refreshProfile}>档案暂时无法读取，草稿已保留 · 重试</button>}
        {category?.bilateral&&<div className="child-body-segments" role="group" aria-label="选择左右">{(['left','right'] as const).map(s=><button type="button" key={s} aria-pressed={side===s} onClick={()=>{setSide(s);setZoom(null);const r=locatorRegion(category,s);if(r&&!r.views.includes(view))setView(r.views[0])}}>{s==='left'?'左':'右'}{category.label}</button>)}</div>}
        {(!categoryId||region&&region.zoom!=='hand'&&region.zoom!=='foot')&&<div className="child-body-segments" role="group" aria-label="身体视图">{(['front','back'] as const).filter(v=>!region||region.views.includes(v)).map(v=><button type="button" key={v} aria-pressed={view===v} onClick={()=>{setView(v);setZoom(null)}}>{v==='front'?'正面':'背面'}</button>)}</div>}
        {region&&localAngles(region).length>0&&<div className="child-body-segments" role="group" aria-label={`${region.label}查看角度`}>{localAngles(region).map(a=><button type="button" key={a.id} aria-pressed={angle===a.id} onClick={()=>{setAngle(a.id);setZoom(null)}}>{a.label}</button>)}</div>}
        {category?.bilateral&&!side?<div className="locator-side-empty"><p>先选择左{category.label}或右{category.label}</p><p>暂不确定时，也可只记录大类。</p></div>:legacyRegion?<div className="locator-middle-scroll child-body-options">{legacyRegion.options.map(item=><button type="button" key={item.id} aria-pressed={draft.some(old=>!old.schemaVersion&&old.id===item.id)} onClick={()=>choose(toBodyLocationSelection(item))}>{item.label}</button>)}</div>:<LocatorStage model={model} view={view} region={region} angle={angle} selectedIds={selectedIds} onRegion={enter} onToggle={toggle} onOverflow={ids=>{setOverflow(ids);setDrawer('more')}} zoom={zoom} onZoom={setZoom}/>}
        {category&&<div className="locator-secondary"><button type="button" onClick={()=>choose(coarseSelection(category,side,model))}>只记录{region?.label??category.label}</button><button type="button" onClick={()=>{setQuery('');setDrawer('text')}}>用文字选择</button></div>}
      </div></BottomSheetSurface>
    {drawer&&<DrawerPanel key={drawer} title={drawer==='selected'?`已选 ${draft.length} 处`:drawer==='text'?'用文字选择':drawer==='more'?'更多部位':drawer==='discard'?'放弃本次部位修改？':'清空全部部位？'} confirmation={drawer==='discard'||drawer==='clear'} onClose={()=>setDrawer(drawer==='clear'?'selected':null)}>
      {drawer==='selected'&&<><div className="locator-drawer-scroll"><p>点名称可返回对应部位，切换视角不会丢失选择。</p><div className="locator-selected-tags" aria-label="本次已选部位">{draft.map(item=><div key={childSelectionKey(item)}><button type="button" onClick={()=>{const id=item.categoryId??(item.parentId?unifiedId(item.parentId):CHILD_LOCATIONS.get(item.id)?.regionId);if(id)enter(unifiedId(id),item);else setNotice('原有位置已保留，可核对名称后重新选择。')}}>{bodyLocationLabel(item)}</button><button type="button" aria-label={`移除${bodyLocationLabel(item)}`} onClick={()=>{setNotice('');setDraft(current=>current.filter(old=>childSelectionKey(old)!==childSelectionKey(item)))}}><X size={16}/></button></div>)}</div>{!draft.length&&<p>尚未选择部位</p>}</div><div className="locator-drawer-actions"><button type="button" disabled={!draft.length} onClick={()=>setDrawer('clear')}>清空全部</button><HohoButton type="button" onClick={()=>setDrawer(null)}>继续选择</HohoButton></div></>}
      {drawer==='text'&&<><label className="child-body-search"><Search size={18}/><input aria-label="搜索当前部位" placeholder="搜索当前部位" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="locator-drawer-scroll">{!region?<p>请先选择左右，再选择具体名称；也可只记录大类。</p>:[...groups].map(([group,items])=><section className="child-body-option-group" key={group}><h4>{group}</h4><div className="child-body-options">{items.map(item=><button type="button" key={item.id} data-location-id={item.id} aria-pressed={selectedIds.includes(item.id)} onClick={()=>toggle(item.id)}>{item.coverage==='specific'?item.label:`${region.label}（具体位置待补充）`}{selectedIds.includes(item.id)&&<Check size={15}/>}</button>)}</div></section>)}</div></>}
      {drawer==='more'&&<div className="locator-drawer-scroll child-body-options">{LOCATOR_CATEGORIES.filter(c=>overflow.includes(c.id)).map(c=><button type="button" key={c.id} data-region-id={c.id} onClick={()=>enter(c.id)}>{c.label}</button>)}<button type="button" onClick={()=>enter('legacy:internal_organs')}>器官</button><button type="button" onClick={()=>enter('legacy:general')}>全身／说不清</button></div>}
      {drawer==='discard'&&<><p>本次修改尚未写回症状记录。</p><div className="locator-drawer-actions"><button type="button" onClick={finishExit}>放弃修改</button><HohoButton type="button" onClick={()=>setDrawer(null)}>继续选择</HohoButton></div></>}
      {drawer==='clear'&&<><p>清空后仍需点击完成，才会写回症状记录。</p><div className="locator-drawer-actions"><button type="button" onClick={()=>setDrawer('selected')}>保留部位</button><HohoButton type="button" onClick={()=>{setDraft([]);setNotice('');setDrawer('selected')}}>确认清空</HohoButton></div></>}
    </DrawerPanel>}</div>,document.body)}
  </div>
}
