import { Archive, MoreHorizontal, RotateCcw, Trash2 } from 'lucide-react'
import { useRef } from 'react'
import type { DesensitizationTaskDto } from '../../services/desensitizationTests'

function MiniTrend({ task }: { task:DesensitizationTaskDto }) {
  return <svg aria-label={`${task.displayName}近7日症状记录，实点有症状，空心点未见，短线资料不足`} className="desensitization-spark" role="img" viewBox="0 0 96 34">{task.trend.map((day,index)=>{const x=7+index*13.5; if(day.state==='unknown')return <path className="unknown" d={`M${x-3} 17h6`} key={day.day}/>;return <circle className={day.state==='symptom'?'symptom':'clear'} cx={x} cy={day.state==='symptom'?8:26} key={day.day} r="3"/>})}</svg>
}
export function DesensitizationTaskCard({ task, open, busy, onOpen, onToggle, onArchive, onDelete, onRestore }:{task:DesensitizationTaskDto;open:boolean;busy:boolean;onOpen:(view:'record'|'trend'|'manage')=>void;onToggle:(open:boolean)=>void;onArchive:()=>void;onDelete:()=>void;onRestore:()=>void}) {
  const start=useRef<{x:number;y:number}|null>(null)
  return <article className={`desensitization-card${open?' is-open':''}${task.status==='archived'?' is-archived':''}`} data-testid={`desensitization-card-${task.displayName}`}>
    <div className="desensitization-card__actions">{task.status==='active'?<button disabled={busy} onClick={onArchive} type="button"><Archive/>归档</button>:<button disabled={busy} onClick={onRestore} type="button"><RotateCcw/>恢复</button>}<button disabled={busy} onClick={onDelete} type="button"><Trash2/>删除</button></div>
    <section className="desensitization-card__surface" onPointerDown={(event)=>{start.current={x:event.clientX,y:event.clientY}}} onPointerUp={(event)=>{const point=start.current;start.current=null;if(!point)return;const dx=event.clientX-point.x,dy=event.clientY-point.y;if(Math.abs(dx)>48&&Math.abs(dx)>Math.abs(dy)*1.5)onToggle(dx<0)}}>
      <header><div><strong>{task.displayName}</strong><span>{task.progressionPaused?'暂停进阶':task.status==='archived'?'已归档':'观察中'}</span></div><button aria-label={`管理${task.displayName}排敏测试`} onClick={()=>onOpen('manage')} type="button"><MoreHorizontal/></button></header>
      <div className="desensitization-card__summary"><button onClick={()=>onOpen('trend')} type="button"><strong>{task.latestSummary}</strong><small>{task.records[0]?.exposureAnswer==='eaten'?'最近记录有摄入':task.records[0]?.exposureAnswer==='not_eaten'?'最近记录未摄入':'摄入情况见详情'}</small></button><button aria-label={`查看${task.displayName}近7日趋势`} onClick={()=>onOpen('trend')} type="button"><MiniTrend task={task}/></button></div>
      <footer><button onClick={()=>onOpen('trend')} type="button">{task.nextStep}<span aria-hidden="true">›</span></button>{task.status==='active'&&<button onClick={()=>onOpen('record')} type="button">记一笔</button>}</footer>
    </section>
  </article>
}
DesensitizationTaskCard.displayName = 'DesensitizationTaskCard'
