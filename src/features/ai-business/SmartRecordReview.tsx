import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { BottomSheetSurface, HealthCard, HohoButton } from '../../components/design-system'
import { manualRecordField } from '../../../shared/manual-smart-record.mjs'
import fieldLabels from '../../../shared/ai-business-field-labels.json'
import { isKeyRecordField, recordCategoryLabels, smartRecordTimeLabel, type SmartRecordDraft, type SmartRecordItem } from './smartRecordTypes'
import { localDateTimeValue } from '../../utils/healthOccurredAt'

type Editing = {itemId:string;field:string;value:string;label:string} | {field:'new';category:string;value:string;timeText:string}
export function SmartRecordReview({review,disabled,error,onChange}:{review:SmartRecordDraft;disabled:boolean;error:string;onChange:(review:SmartRecordDraft)=>void}){
  const [editing,setEditing]=useState<Editing|null>(null),[formError,setFormError]=useState('')
  const open=(value:Editing)=>{setFormError('');setEditing(value)}
  const commit=()=>{
    if(!editing||disabled)return
    if(!editing.value.trim()){setFormError('请填写内容');return}
    if(editing.field==='new'&&'category' in editing){
      if(!editing.timeText.trim()){setFormError('请填写发生时间');return}
      const item:SmartRecordItem={id:`manual-${crypto.randomUUID()}`,category:editing.category,title:editing.value.trim().slice(0,24),timeText:editing.timeText.trim(),time:{resolvedStart:null,precision:'unknown'},userAdded:true,fields:[{name:manualRecordField(editing.category),value:editing.value.trim(),sources:[],editedBy:'user'}]}
      onChange({...review,items:[...review.items,item]})
    }else if('itemId' in editing){
      onChange({...review,items:review.items.map(item=>item.id!==editing.itemId?item:editing.field==='title'?{...item,title:editing.value,titleChanged:true}:editing.field==='category'?{...item,category:editing.value,categoryChanged:true}:editing.field==='time'?{...item,timeText:editing.value,timeChanged:true}:{...item,fields:item.fields.map(field=>field.name===editing.field?{...field,value:editing.value,editedBy:'user'}:field)})})
    }
    setEditing(null)
  }
  const row=(item:SmartRecordItem,label:string,value:string,field:string)=><div className="smart-review-row" key={field}><dt>{label}</dt><dd>{value||'未填写'}</dd><HohoButton variant="text" size="icon" disabled={disabled} aria-label={`编辑${item.title}的${label}`} onClick={()=>open({itemId:item.id,field,value:field==='time'?item.timeText??(item.time.resolvedStart?localDateTimeValue(new Date(item.time.resolvedStart)).replace('T',' '):''):value,label})}><Pencil size={16} aria-hidden="true"/></HohoButton></div>
  return <div className="smart-record-review" aria-label="核对记录">
    {review.items.map(item=><HealthCard key={item.id} className="smart-record-item smart-review-card">
      <header><strong>{item.title}</strong><HohoButton variant="text" size="icon" disabled={disabled} aria-label={`编辑${item.title}的名称`} onClick={()=>open({itemId:item.id,field:'title',value:item.title,label:item.category==='symptom'?'症状':'记录名称'})}><Pencil size={16} aria-hidden="true"/></HohoButton><HohoButton variant="text" size="icon" disabled={disabled} aria-label={`删除${item.title}`} onClick={()=>onChange({...review,items:review.items.filter(candidate=>candidate.id!==item.id),deletedItemIds:item.userAdded?review.deletedItemIds:[...new Set([...(review.deletedItemIds??[]),item.id])]})}><Trash2 size={18} aria-hidden="true"/></HohoButton></header>
      <dl>{row(item,'记录类型',recordCategoryLabels[item.category]??'其他','category')}
        {item.fields.filter(field=>isKeyRecordField(item.category,field.name)).map(field=>row(item,item.fields.length===1||field.name==='symptom'?'原话':field.name==='durationMinutes'?'睡眠时长':(fieldLabels as Record<string,string>)[field.name]??field.name,field.value,field.name))}
        {row(item,'发生时间',smartRecordTimeLabel(item),'time')}
      </dl>
    </HealthCard>)}
    <HohoButton variant="secondary" disabled={disabled||review.items.length>=30} onClick={()=>open({field:'new',category:'symptom',value:'',timeText:''})}><Plus size={18} aria-hidden="true"/>新增记录</HohoButton>
    {error&&<p role="alert">{error}</p>}
    {editing&&<BottomSheetSurface open viewportAware label={editing.field==='new'?'新增记录':'编辑记录'} title={editing.field==='new'?'新增记录':'itemId' in editing?editing.label:'编辑记录'} onClose={()=>setEditing(null)} footer={<HohoButton fullWidth disabled={disabled} onClick={commit}>{editing.field==='new'?'添加':'确定'}</HohoButton>}>
      <div className="smart-review-editor">
        {(editing.field==='category'||editing.field==='new')&&<label>记录类型<select value={'category' in editing?editing.category:editing.value} onChange={event=>setEditing('category' in editing?{...editing,category:event.target.value}:{...editing,value:event.target.value})}>{Object.entries(recordCategoryLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}
        {editing.field!=='category'&&<label>{editing.field==='time'?'发生时间':'itemId' in editing?editing.label:'原话'}<textarea aria-label={editing.field==='time'?'发生时间':'itemId' in editing?editing.label:'原话'} autoFocus maxLength={editing.field==='time'?100:4000} value={editing.value} onChange={event=>setEditing({...editing,value:event.target.value})}/></label>}
        {'timeText' in editing&&<label>发生时间<input value={editing.timeText} maxLength={100} onChange={event=>setEditing({...editing,timeText:event.target.value})}/></label>}
        {formError&&<p role="alert">{formError}</p>}
      </div>
    </BottomSheetSurface>}
  </div>
}
