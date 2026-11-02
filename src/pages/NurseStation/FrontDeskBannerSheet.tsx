import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { BottomSheetSurface, HohoButton } from '../../components/design-system'
import { getCapabilityProfile, type CapabilityProfile } from '../../services/capabilities'
import nursePortrait from '../../assets/nurse-triage/front-desk-nurse-glasses-20261030.webp'
import './bannerCapabilities.css'

export type BannerKind = 'welcome'|'visit'|'memory'
export function FrontDeskBannerSheet({kind,onClose}:{kind:BannerKind;onClose:()=>void}){
 const [profile,setProfile]=useState<CapabilityProfile|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0)
 useEffect(()=>{const controller=new AbortController();setError('');setProfile(null);void getCapabilityProfile(controller.signal).then(data=>{if(!data.metrics||!Array.isArray(data.sources))throw Error('介绍资料格式异常');if(!controller.signal.aborted)setProfile(data)}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'暂时无法读取介绍')});return()=>controller.abort()},[retry])
 const title=kind==='welcome'?'认识你的记录员':kind==='visit'?'一键整理，一次说清':'记忆如何留下'
 return createPortal(<BottomSheetSurface open title={title} label={title} onClose={onClose} className="banner-capability-sheet" footer={<HohoButton variant="text" fullWidth onClick={onClose}>了解了</HohoButton>}>
  <div className="banner-capability-content">
   {kind==='welcome'?<><div className="banner-capability-identity"><div><p className="hoho-text-caption">AI 家庭健康记录员</p><h3 className="hoho-text-page-title">护护</h3><p>为你和孩子，认真留好每一次健康记录。</p></div><img src={nursePortrait} alt="Banner 中戴眼镜与口罩、手持病历夹和笔的护护" width={480} height={786}/></div>
    <dl className="banner-capability-skills">{(profile?.skills??[{title:'专业接待',text:'核对人物、时间与关键细节。'},{title:'严谨整理',text:'区分事实与推测，保留原话。'},{title:'长期归档',text:'保存后可以回看与补充。'},{title:'就诊准备',text:'把零散信息整理成清楚的情况。'}]).map(item=><div key={item.title}><dt>{item.title}</dt><dd>{item.text}</dd></div>)}</dl></>:
    kind==='visit'?<><h3 className="hoho-text-page-title">把来龙去脉，交代清楚。</h3><p>将你已保存的相关记录，整理成便于向医生说明的情况。</p><dl className="banner-capability-skills"><div><dt>梳理经过</dt><dd>按发生时间组织症状、变化和已做处理。</dd></div><div><dt>保留依据</dt><dd>以实际提供的记录与资料为准，不补写未知事实。</dd></div><div><dt>由你核对</dt><dd>确认人物、时间和内容，再用于就诊说明。</dd></div></dl></>:
    <><h3 className="hoho-text-page-title">记下的细节，回头有处找。</h3><p>“记忆”来自已保存的记录和原始资料。</p><dl className="banner-capability-skills"><div><dt>分别归档</dt><dd>记录按账户与记录对象归属管理。</dd></div><div><dt>再次回看</dt><dd>从对话记录、健康日历或档案查看已有内容。</dd></div><div><dt>相关检索</dt><dd>对话只使用当次可取得的相关记录，不代表无限记忆或自动读取全部历史。</dd></div></dl></>}
   {error?<div role="alert"><p>{error}</p><HohoButton variant="secondary" onClick={()=>setRetry(n=>n+1)}>重新读取专业资料</HohoButton></div>:!profile?<p role="status" className="hoho-text-caption">正在核对资料目录…</p>:<>
    <section className="banner-capability-basis" aria-label="专业资料基础"><h4>专业资料支持</h4><p><strong>{profile.metrics.books}</strong> 部开放护理教材 · <strong>{profile.metrics.sourceSelections}</strong> 份许可选段</p><p>{profile.metrics.observationTopics} 类观察主题 · {profile.metrics.questionRules} 项记录问询规则</p><p className="hoho-text-caption">已接入 {profile.metrics.recordingMethods} 项记录方法；资料规模不代表临床能力认证。</p></section>
    <details className="banner-capability-sources"><summary>查看资料来源</summary><p className="hoho-text-caption">仅统计已导入且完整性核对通过的选段，未将章节数算作教材数。</p>{profile.sources.map(s=><div key={s.id}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.book} · {s.title}</a><p className="hoho-text-caption">{s.license} · {s.retrievedAt}</p><p className="hoho-text-caption">{s.attribution}</p></div>)}</details>
    <p className="hoho-text-caption">{profile.notice}</p>
   </>}
  </div>
 </BottomSheetSurface>,document.body)
}
