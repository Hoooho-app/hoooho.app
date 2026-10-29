import { ArrowLeft, Check, X } from '../../icons'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BottomSheetSurface, HohoButton } from '../../design-system'
import { useDialogFocus } from '../../../hooks/useDialogFocus'
import { type BodyLocationSelection } from '../../../features/body-location'
import { CHILD_LOCATIONS, CHILD_REGIONS, childSelectionKey, confirmChildSelection, resolveChildModel, type ChildView } from '../../../features/body-location/childBodyCatalog'
import { localAngles, type Bounds, type LocalAngle } from '../../../features/body-location/childBodyGeometry'
import { LOCATOR_CATEGORIES, bodyLocationLabel, locatorRegion, toggleLocatorSelection, categoryId as unifiedId, type LocatorSide } from '../../../features/body-location/locatorDictionary'
import { ownChildBodyHistory } from '../../../features/body-location/childBodyHistory'
import { familyMemberService } from '../../../services/familyMembers'
import { useAppStore } from '../../../store/useAppStore'
import { graphicalRegionLabel, graphicalSelection } from '../../../features/body-location/graphicalLocator'
import { LocatorStage } from './LocatorStage'
import './child-body-location.css'

interface Props { memberId:string; value:BodyLocationSelection[]; onChange:(values:BodyLocationSelection[])=>void; buttonLabel?:string; confirmLabel?:string; showCommitted?:boolean }
type Drawer='selected'|'discard'|'clear'|null
function DrawerPanel({title,children,onClose,confirmation=false}:{title:string;children:ReactNode;onClose:()=>void;confirmation?:boolean}) {
  const ref=useRef<HTMLElement>(null);useDialogFocus(true,ref)
  return <div className="locator-drawer-layer"><button type="button" className="locator-drawer-backdrop" aria-label={`收起${title}`} onClick={onClose}/><section className="locator-drawer" role={confirmation?'alertdialog':'dialog'} aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}><header><h3>{title}</h3><button type="button" aria-label={`关闭${title}`} onClick={onClose}><X size={20}/></button></header>{children}</section></div>
}
export function ChildBodyLocationPicker({memberId,value,onChange,buttonLabel,confirmLabel='完成并返回症状记录',showCommitted=true}:Props) {
  const token=useAppStore(s=>s.authToken??''),cached=useAppStore(s=>s.members.find(m=>m.id===memberId))
  const [profile,setProfile]=useState<{id:string;name:string;gender:unknown}|null>(null),[profileStatus,setProfileStatus]=useState<'loading'|'ready'|'error'>('loading')
  const [open,setOpen]=useState(false),[draft,setDraft]=useState<BodyLocationSelection[]>([])
  const [categoryId,setCategoryId]=useState(''),[side,setSide]=useState<LocatorSide>(''),[view,setView]=useState<ChildView>('front'),[angle,setAngle]=useState<LocalAngle>('palm')
  const [drawer,setDrawer]=useState<Drawer>(null),[notice,setNotice]=useState(''),[zoom,setZoom]=useState<Bounds|null>(null)
  const initial=useRef(''),openedMember=useRef(''),instance=useRef(crypto.randomUUID()),release=useRef<(()=>void)|undefined>(),allowExit=useRef(false),moving=useRef(false),session=useRef<HTMLDivElement>(null),profileVersion=useRef(0)
  const opener=useRef<HTMLElement|null>(null),drawerTrigger=useRef<HTMLElement|null>(null)
  const member=profile?.id===memberId?profile:cached,model=resolveChildModel(member?.gender)??'neutral'
  const category=LOCATOR_CATEGORIES.find(c=>c.id===categoryId),region=locatorRegion(category,side)
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
    if(categoryId){setCategoryId('');setSide('');return}
    requestClose()
  }
  const actions=useRef({back,end,dirty,drawer,zoom,categoryId});actions.current={back,end,dirty,drawer,zoom,categoryId}
  const begin=()=>{
    opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;drawerTrigger.current=null
    openedMember.current=memberId;const cloned=value.map(item=>({...item}));initial.current=JSON.stringify(cloned);setDraft(cloned)
    setCategoryId('');setSide('');setView('front');setAngle('palm');setDrawer(null);setNotice('');setZoom(null);allowExit.current=false;moving.current=false
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
    const direct=CHILD_REGIONS.find(r=>r.id===id),target=direct?unifiedId(direct.id):id
    const c=LOCATOR_CATEGORIES.find(c=>c.id===target),knownSide=direct?.side??(restore&&CHILD_LOCATIONS.get(restore.id)?.regionId.match(/_(left|right)$/)?.[1])
    const nextSide:LocatorSide=restore?.laterality==='left'||restore?.laterality==='right'?restore.laterality:knownSide==='left'||knownSide==='right'?knownSide:''
    const r=locatorRegion(c,nextSide),v=restore?.view==='back'?'back':restore?.view==='front'?'front':view
    setCategoryId(target);setSide(nextSide);setDrawer(null);setZoom(null);setView(r&&!r.views.includes(v)?r.views[0]:v)
    setAngle(c?.id==='foot'&&restore?.surface==='medial'?'medial':c?.id==='foot'&&restore?.surface==='lateral'?'lateral':restore?.surface==='dorsal'?'dorsal':restore?.surface==='plantar'?'plantar':c?.id==='foot'?'dorsal':'palm')
  }
  const choose=(next:BodyLocationSelection)=>setDraft(current=>{const result=toggleLocatorSelection(current,next);if(result.length>20){setNotice('每次最多选择20个部位，请先移除已有部位。');return current}setNotice('');return result})
  const toggle=(id:string)=>choose({...graphicalSelection(id,model),view:region?.zoom==='hand'?(angle==='palm'?'palm':'dorsum'):region?.zoom==='foot'?(angle==='plantar'?'sole':'front'):view})
  const confirm=()=>{if(moving.current)return;try{const result=confirmChildSelection(draft,openedMember.current,memberId);initial.current=JSON.stringify(result);onChange(result);finishExit()}catch(error){setNotice((error as Error).message)}}
  const selectedIds=draft.map(item=>item.id)
  return <div className="child-body-picker"><button className="body-location-picker-action child-body-open" type="button" onClick={begin}>{buttonLabel??(value.length?'修改部位':'选择部位')}</button>
    {showCommitted&&value.length>0&&<div className="child-body-committed" aria-label="已选择的症状部位">{value.map(item=><span key={childSelectionKey(item)}><Check size={15}/>{bodyLocationLabel(item)}</span>)}</div>}
    {open&&createPortal(<div ref={session} className="locator-session"><BottomSheetSurface className="body-location-sheet child-body-sheet" layerClassName="child-body-layer" label="身体部位定位器" title={region?graphicalRegionLabel(region):'选择身体部位'} leading={<button type="button" className="hoho-bottom-sheet__back" aria-label={categoryId?'返回全身':'取消选择'} onClick={back}><ArrowLeft size={20}/></button>} onClose={requestClose} open size="workspace"
      footer={<div className="child-body-footer"><div className="locator-selected-line"><span aria-live="polite">{draft.length>0?bodyLocationLabel(draft.at(-1)!):''}</span>{draft.length>0&&<button type="button" onClick={()=>setDrawer('selected')}>已选 {draft.length} 处</button>}</div>{notice&&<span className="locator-notice" role="alert">{notice}</span>}<HohoButton type="button" disabled={!draft.length&&!value.length} onClick={confirm}><Check size={17}/>完成</HohoButton></div>}>
      <div className="locator-workspace">
        {profileStatus==='error'&&<button className="locator-profile-error" type="button" onClick={refreshProfile}>档案暂时无法读取，草稿已保留 · 重试</button>}
        <LocatorStage model={model} view={view} region={region} angle={angle} selectedIds={selectedIds} onRegion={enter} onToggle={toggle} zoom={zoom} onZoom={setZoom} controls={<>
          {(!region||region.zoom!=='hand'&&region.zoom!=='foot')&&<div className="child-body-segments" role="group" aria-label="身体视图">{(['front','back'] as const).filter(v=>!region||region.views.includes(v)).map(v=><button type="button" key={v} aria-pressed={view===v} onClick={()=>{setView(v);setZoom(null)}}>{v==='front'?'正面':'背面'}</button>)}</div>}
          {region&&localAngles(region).length>0&&<div className="child-body-segments" role="group" aria-label={`${region.label}查看角度`}>{localAngles(region).filter(a=>!['medial','lateral'].includes(a.id)).map(a=><button type="button" key={a.id} aria-pressed={angle===a.id} onClick={()=>{setAngle(a.id);setZoom(null)}}>{a.label}</button>)}</div>}
        </>}/>
      </div></BottomSheetSurface>
    {drawer&&<DrawerPanel key={drawer} title={drawer==='selected'?`已选 ${draft.length} 处`:drawer==='discard'?'放弃本次部位修改？':'清空全部部位？'} confirmation={drawer==='discard'||drawer==='clear'} onClose={()=>setDrawer(drawer==='clear'?'selected':null)}>
      {drawer==='selected'&&<><div className="locator-drawer-scroll"><p>点名称可返回对应部位，切换视角不会丢失选择。</p><div className="locator-selected-tags" aria-label="本次已选部位">{draft.map(item=><div key={childSelectionKey(item)}><button type="button" onClick={()=>{const id=item.categoryId??(item.parentId?unifiedId(item.parentId):CHILD_LOCATIONS.get(item.id)?.regionId);if(id)enter(unifiedId(id),item);else setNotice('原有位置已保留，可核对名称后重新选择。')}}>{bodyLocationLabel(item)}</button><button type="button" aria-label={`移除${bodyLocationLabel(item)}`} onClick={()=>{setNotice('');setDraft(current=>current.filter(old=>childSelectionKey(old)!==childSelectionKey(item)))}}><X size={16}/></button></div>)}</div>{!draft.length&&<p>尚未选择部位</p>}</div><div className="locator-drawer-actions"><button type="button" disabled={!draft.length} onClick={()=>setDrawer('clear')}>清空全部</button><HohoButton type="button" onClick={()=>setDrawer(null)}>继续选择</HohoButton></div></>}
      {drawer==='discard'&&<><p>本次修改尚未写回症状记录。</p><div className="locator-drawer-actions"><button type="button" onClick={finishExit}>放弃修改</button><HohoButton type="button" onClick={()=>setDrawer(null)}>继续选择</HohoButton></div></>}
      {drawer==='clear'&&<><p>清空后仍需点击完成，才会写回症状记录。</p><div className="locator-drawer-actions"><button type="button" onClick={()=>setDrawer('selected')}>保留部位</button><HohoButton type="button" onClick={()=>{setDraft([]);setNotice('');setDrawer('selected')}}>确认清空</HohoButton></div></>}
    </DrawerPanel>}</div>,document.body)}
  </div>
}
