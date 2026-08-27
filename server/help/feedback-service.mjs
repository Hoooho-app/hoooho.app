import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { JsonStore } from '../auth/storage/json-store.mjs'

export class FeedbackError extends Error { constructor(message, status=400, code='FEEDBACK_ERROR'){super(message);this.status=status;this.code=code} }
export class FeedbackService {
  #store
  constructor(options={}) { this.#store = options.store ?? new JsonStore(path.join(options.dataDirectory, 'feedback.json'), { feedback: [] }) }
  async create(accountId,input,now=new Date()) {
    const category=String(input.category??'').trim(); const description=String(input.description??'').trim(); const page=String(input.page??'').trim(); const device=String(input.device??'').trim(); const contact=String(input.contact??'').trim()
    if(!category||category.length>30)throw new FeedbackError('请选择问题分类',400,'INVALID_FEEDBACK_CATEGORY')
    if(description.length<10||description.length>2000)throw new FeedbackError('问题描述应为 10–2000 个字符',400,'INVALID_FEEDBACK_DESCRIPTION')
    if(page.length>100||contact.length>120||!['手机','电脑'].includes(device))throw new FeedbackError('反馈信息格式错误',400,'INVALID_FEEDBACK_FIELDS')
    const item={id:randomUUID(),accountId,category,description,page,device,contact:contact||null,includeDiagnostics:Boolean(input.includeDiagnostics),createdAt:now.toISOString(),status:'received'}
    await this.#store.update((data)=>({...data,feedback:[...data.feedback,item]})); return {id:item.id,status:item.status,createdAt:item.createdAt}
  }
}
