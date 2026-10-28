import {maskIdentityName} from '../../utils/privateIdentity'
import {HohoButton} from '../../components/design-system'

export interface UploadRecognitionDraft {draftId:string;draftVersion:number;text:string;warnings:string[];canAdopt:boolean;canConfirmSubject?:boolean}
export function UploadRecognitionPreview({draft,onReview,onConfirmSubject,memberName,disabled=false}:{draft:UploadRecognitionDraft;onReview?:()=>void;onConfirmSubject?:()=>void;memberName?:string;disabled?:boolean}){
  return <section aria-label="资料识别结果" className="grid gap-2">
    <strong>识别内容待核对</strong>
    <div className="whitespace-pre-wrap">{draft.text}</div>
    {draft.warnings.map((warning,index)=><div role="status" key={index}>{warning}</div>)}
    {onReview&&draft.canAdopt&&<HohoButton variant="secondary" disabled={disabled} onClick={onReview}>核对识别内容</HohoButton>}
    {!draft.canAdopt&&draft.canConfirmSubject&&onConfirmSubject&&<HohoButton variant="secondary" disabled={disabled} onClick={onConfirmSubject}>这是{maskIdentityName(memberName)||'当前成员'}的资料</HohoButton>}
  </section>
}
