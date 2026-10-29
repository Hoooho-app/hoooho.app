import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { UsersRound } from '../../components/icons'
import { WebPageHeader } from '../../components/common/WebPageHeader'
import { ConfirmDialog } from '../../components/design-system/ConfirmDialog'
import { EmptyState } from '../../components/design-system/EmptyState'
import { HohoButton } from '../../components/design-system/HohoButton'
import { HohoInput } from '../../components/design-system/HohoInput'
import { HohoSection } from '../../components/design-system/HohoSection'
import { HohoSurfaceRow } from '../../components/design-system/HohoSurfaceRow'
import { StatusNotice } from '../../components/design-system/StatusNotice'
import { familyMemberService } from '../../services/familyMembers'
import { useAppStore } from '../../store/useAppStore'
import type { FamilyMemberApiDto } from '../../types'
import { familySharingApi, type FamilyOverview, type FamilySpace, type ImportPreview } from './api'

const date = (value: string) => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
const actions: Record<string, string> = { space_created: '创建家庭', invitation_created: '发出邀请', invitation_accepted: '接受邀请', child_linked: '关联个人档案', records_shared: '共享记录批次', batch_withdrawn: '撤回共享批次', access_revoked: '停止共享授权' }
const types: Record<string, string> = { medication: '用药', diet: '喂养与饮食', symptom: '症状', sleep: '睡眠', bowel: '排便', vaccination: '接种', temperature: '体温', visit: '就诊' }
type Confirmation = { title: string; description: string; label: string; danger?: boolean; run: () => Promise<void> }
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = filename; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function FamilySharingPage() {
  const token = useAppStore(s => s.authToken) ?? '', accountId = useAppStore(s => s.authUser?.id) ?? ''
  const [params, setParams] = useSearchParams(), navigate = useNavigate(), spaceId = params.get('space') ?? ''
  const [overview, setOverview] = useState<FamilyOverview | null>(null), [space, setSpace] = useState<FamilySpace | null>(null)
  const [members, setMembers] = useState<FamilyMemberApiDto[]>([]), [chosenChildren, setChosenChildren] = useState<string[]>([])
  const [childId, setChildId] = useState(''), [sourceMember, setSourceMember] = useState('new'), [recipient, setRecipient] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null), [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0), [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const reload = () => setRefresh(n => n + 1)
  const openSpace = (id: string) => { setPreview(null); setChildId(''); setParams({ space: id }) }

  useEffect(() => {
    setOverview(null); setSpace(null); setPreview(null); setSelected([]); setMembers([]); setChosenChildren([]); setNotice(''); setError(''); setConfirmation(null)
  }, [accountId, spaceId])
  useEffect(() => {
    if (!accountId) { setLoading(false); return }
    const controller = new AbortController()
    setLoading(true); setError('')
    void Promise.all([familySharingApi.overview(token, controller.signal), familyMemberService.list(token, controller.signal), spaceId ? familySharingApi.space(token, spaceId, controller.signal) : Promise.resolve(null)])
      .then(([nextOverview, nextMembers, nextSpace]) => {
        if (controller.signal.aborted) return
        setOverview(nextOverview); setMembers(nextMembers.filter(m => m.relationship === 'child')); setSpace(nextSpace)
        if (nextSpace) setChildId(current => nextSpace.children.some(c => c.id === current) ? current : nextSpace.children[0]?.id ?? '')
      }).catch(cause => { if (!controller.signal.aborted) { setSpace(null); setPreview(null); setError(cause instanceof Error ? cause.message : '暂时无法读取家庭工作区') } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [accountId, token, spaceId, refresh])
  useEffect(() => {
    if (!spaceId) return
    const focus = () => reload(), timer = window.setInterval(() => { if (document.visibilityState === 'visible') reload() }, 20_000)
    window.addEventListener('focus', focus)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', focus) }
  }, [spaceId])

  async function perform(work: () => Promise<void>) {
    if (busy) return
    const actor = accountId
    setBusy(true); setError(''); setNotice('')
    try { await work(); if (useAppStore.getState().authUser?.id === actor) { setConfirmation(null); reload() } }
    catch (cause) { if (useAppStore.getState().authUser?.id === actor) setError(cause instanceof Error ? cause.message : '操作未完成，请重试') }
    finally { setBusy(false) }
  }
  const selectedChild = space?.children.find(c => c.id === childId)
  const eligibleMembers = members.filter(m => !space?.children.some(c => c.id !== childId && c.myMemberId === m.id))
  const shownEntries = space?.entries.filter(e => e.childId === childId) ?? []
  const ask = (value: Confirmation) => setConfirmation(value)

  return <div className="min-h-dvh bg-page text-text-primary">
    <WebPageHeader title="共同照顾" onBack={() => spaceId ? setParams({}) : navigate('/care-journey')} action={<HohoButton size="small" variant="text" disabled={loading || busy} onClick={reload}>刷新</HohoButton>} />
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      {error && <StatusNotice title={error} tone="error" action={<HohoButton variant="text" size="small" onClick={reload}>重试</HohoButton>} />}
      {notice && <StatusNotice title={notice} tone="success" />}
      {loading && !overview && <p className="hoho-text-body" role="status">正在读取家庭工作区…</p>}
      {!accountId && <EmptyState title="请先登录自己的账号" description="同一账号多设备同步继续免费。家庭协作使用两个独立成人账号。" action={<HohoButton onClick={() => navigate('/login')}>前往登录</HohoButton>} />}
      {overview && !spaceId && <>
        <HohoSection title="两个人，一起照顾" description="一份家庭空间，两位成人账号。孩子默认私有，由你选择共享。">
          <p className="hoho-text-caption">目前提供主动预览、批次共享的记录工作区。原档案与原记录留在本人账号，不会自动合并药量，也不会自动同步其他页面。</p>
        </HohoSection>
        {!overview.capability.active && <StatusNotice title="家庭协作尚未正式开放">订阅支付尚未开放。已有共享历史仍可查看、导出；免费记录和同账号多设备同步不受影响。</StatusNotice>}
        {overview.capability.mode === 'internal_test' && <StatusNotice title="家庭协作内部测试">当前为指定账号测试权限，不代表已购买会员。</StatusNotice>}
        {overview.invitations.length > 0 && <HohoSection title="邀请你共同照顾">{overview.invitations.map(invitation => <HohoSurfaceRow key={invitation.id} title={invitation.childNames.join('、')} description={`邀请至 ${date(invitation.expiresAt)} 有效`} action={<HohoButton size="small" disabled={busy} onClick={() => ask({ title: '接受共同照顾邀请', description: `你将查看 ${invitation.childNames.join('、')} 的指定共享记录与附件。你的私人档案不会自动共享；关联和发布自己的记录仍需确认。本人原记录留在个人账号。`, label: '确认接受', run: async () => { const saved = await familySharingApi.accept(token, invitation.id); openSpace(saved.id) } })}>查看并接受</HohoButton>} />)}</HohoSection>}
        <HohoSection title="我的家庭工作区">{overview.spaces.length ? overview.spaces.map(item => <HohoSurfaceRow key={item.id} title={item.childNames.join('、')} description={`${item.participantCount} 位照顾者 · ${item.active ? '可共享新记录' : '历史可读，新增共享已暂停'}`} onActivate={() => openSpace(item.id)} />) : <p className="hoho-text-body">还没有家庭工作区。</p>}</HohoSection>
        {overview.capability.active && !overview.spaces.some(item => item.role === 'admin') && <HohoSection title="选择要共享的孩子" description="先创建工作区，再邀请对方。新增加的孩子不会自动加入。">
          <div className="space-y-3">{members.map(member => <label key={member.id} className="hoho-text-body flex min-h-11 items-center gap-3"><input type="checkbox" checked={chosenChildren.includes(member.id)} onChange={event => setChosenChildren(current => event.target.checked ? [...current, member.id] : current.filter(id => id !== member.id))} />{member.name}</label>)}
            {!members.length && <p className="hoho-text-caption">先在孩子档案中添加孩子。</p>}
            <HohoButton fullWidth disabled={busy || !chosenChildren.length} onClick={() => ask({ title: '创建家庭工作区', description: '仅加入选中的孩子。之后发出的邀请会明确显示孩子范围，双方确认后才能查阅共享的记录和附件。原档案仍由本人保留。', label: '确认创建', run: async () => { const saved = await familySharingApi.create(token, chosenChildren); openSpace(saved.id) } })}>创建家庭工作区</HohoButton>
          </div>
        </HohoSection>}
      </>}
      {space && <>
        {space.permission.mode === 'internal_test' && <StatusNotice title="内部测试工作区">仅批次共享已确认的正式记录，不是完整档案自动同步。</StatusNotice>}
        {!space.permission.active && <StatusNotice title="新增共享已暂停">此前共享的历史仍可查看和导出。你可以继续在自己的档案免费记录；恢复协作后需确认才共享新内容。</StatusNotice>}
        <HohoSection title="共同照顾者">{space.participants.map(participant => <HohoSurfaceRow key={participant.accountId} leading={<UsersRound size={20} aria-hidden="true" />} title={participant.name} description={`${participant.role === 'admin' ? '家庭管理员' : '共同照顾者'}${participant.accountId === accountId ? ' · 我' : ''}`} action={participant.role !== 'admin' && (space.role === 'admin' || participant.accountId === accountId) ? <HohoButton size="small" variant="text" disabled={busy} onClick={() => ask({ title: participant.accountId === accountId ? '退出家庭' : '停止共享授权', description: '对应账号将立即失去此工作区的在线访问权限，其发布的快照与附件也会从工作区撤下。双方原记录仍在各自个人档案；已导出的文件无法远程删除。', label: '确认停止', danger: true, run: async () => { await familySharingApi.revoke(token, space.id, participant.accountId); if (participant.accountId === accountId) setParams({}); else setNotice('已停止对应账号的共享授权') } })}>{participant.accountId === accountId ? '退出' : '停止授权'}</HohoButton> : undefined} />)}</HohoSection>
        {space.role === 'admin' && space.permission.active && space.participants.length < 2 && <HohoSection title="邀请另一位照顾者" description="填写对方账号的 Hoooho ID；邀请24小时有效，只能由指定账号接受。">
          <div className="space-y-3"><HohoInput label="对方 Hoooho ID" value={recipient} maxLength={8} placeholder="H 开头的8位 ID" autoCapitalize="characters" onChange={event => setRecipient(event.target.value.toUpperCase().trim())} />
            <HohoButton fullWidth disabled={busy || !/^H[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{7}$/.test(recipient)} onClick={() => ask({ title: '确认邀请范围', description: `将邀请 ${recipient} 共同照顾 ${space.children.map(child => child.name).join('、')}。对方接受后可看你已发布的记录与关联附件，不会得到其他孩子的私人资料。`, label: '发出邀请', run: async () => { const invitation = await familySharingApi.invite(token, space.id, recipient); setNotice(`邀请已创建，${date(invitation.expiresAt)} 前由对方在共同照顾页接受`) } })}>发出邀请</HohoButton></div>
        </HohoSection>}
        <HohoSection title="共享孩子"><label className="hoho-field"><span className="hoho-text-label">当前孩子</span><select className="hoho-input" value={childId} onChange={event => { setChildId(event.target.value); setPreview(null) }}>{space.children.map(child => <option key={child.id} value={child.id}>{child.name}</option>)}</select></label></HohoSection>
        {selectedChild && !selectedChild.myMemberId && space.permission.active && <HohoSection title="关联你的个人档案" description={`请先核对：${selectedChild.name}，出生日期 ${selectedChild.birthday ?? '待核对'}。同名不代表同一个孩子。`}>
          <div className="space-y-3"><label className="hoho-field"><span className="hoho-text-label">你的孩子档案</span><select className="hoho-input" value={sourceMember} onChange={event => setSourceMember(event.target.value)}><option value="new">我还没有档案，建立个人副本</option>{eligibleMembers.map(member => <option key={member.id} value={member.id}>{member.name} · {member.birthday ?? '生日待核对'}</option>)}</select></label>
            <HohoButton disabled={busy} onClick={() => ask({ title: '确认是同一个孩子', description: '只关联这一名孩子，原私人档案不覆盖。新记录仍先保存在自己的账号，选择批次并确认后才共享；退出家庭不影响本人原始记录。', label: '确认关联', run: async () => { await familySharingApi.link(token, space.id, childId, sourceMember); setNotice('已关联个人档案，可继续使用现有记录表单') } })}>核对并关联</HohoButton></div>
        </HohoSection>}
        {selectedChild?.myMemberId && <HohoSection title="共享我的正式记录" description="先在自己的档案里照常记录，再预览选择本批内容。私人新增记录不会自动发送给对方。">
          <div className="flex flex-wrap gap-3"><HohoButton disabled={busy || !space.permission.active} loading={busy} onClick={() => void perform(async () => { const next = await familySharingApi.preview(token, space.id, childId); setPreview(next); setSelected(next.candidates.filter(c => !c.possibleDuplicate).map(c => c.sourceRecordId)); if (!next.candidates.length) setNotice('当前没有尚未共享或发生更正的正式记录') })}>预览可共享记录</HohoButton><HohoButton variant="secondary" onClick={() => { useAppStore.getState().setCurrentMemberId(selectedChild.myMemberId!); navigate('/health-events') }}>去个人档案记录</HohoButton></div>
        </HohoSection>}
        {preview && preview.candidates.length > 0 && <HohoSection title="核对本批共享" description="疑似重复默认不选。不会自动删除原记录、合并药量，也不会覆盖孩子档案。">
          <div className="space-y-4">{preview.candidates.map(record => <label key={record.sourceRecordId} className="flex items-start gap-3 border-b border-border pb-3"><input className="mt-1" type="checkbox" checked={selected.includes(record.sourceRecordId)} onChange={event => setSelected(current => event.target.checked ? [...current, record.sourceRecordId] : current.filter(id => id !== record.sourceRecordId))} /><span className="min-w-0"><span className="hoho-text-label block">{date(record.occurredAt)} · {record.action === 'update' ? '原记录有更正' : types[record.type] ?? record.type}</span><span className="hoho-text-body block whitespace-pre-wrap break-words">{record.content}</span><span className="hoho-text-caption block">{record.possibleDuplicate ? '疑似重复，请核对后选择 · ' : ''}{record.attachments.length} 个关联附件</span></span></label>)}
            {preview.remainingCount > 0 && <p className="hoho-text-caption">本批最多200条；仍有 {preview.remainingCount} 条，可在完成后继续预览。</p>}
            <HohoButton fullWidth disabled={busy || !selected.length || !space.permission.active} onClick={() => ask({ title: `共享选中的 ${selected.length} 条记录`, description: '对方将看到所选记录内容、备注、原作者、发生时间及关联附件。原始对话和未关联附件不在本批内。确认后可按批次撤回，个人原记录不变。', label: '确认共享', run: async () => { const saved = await familySharingApi.confirm(token, space.id, preview.id, selected); setPreview(null); setNotice(`本批已共享 ${saved.count} 条记录`) } })}>确认本批共享</HohoButton>
          </div>
        </HohoSection>}
        <HohoSection title="已共享记录" action={<HohoButton variant="text" size="small" disabled={!shownEntries.length} onClick={() => saveBlob(new Blob([JSON.stringify({ child: selectedChild, scope: '授权共享的记录快照', exportedAt: new Date().toISOString(), entries: shownEntries }, null, 2)], { type: 'application/json' }), 'Hoooho-共同照顾记录.json')}>导出</HohoButton>}>
          {shownEntries.length ? <div className="space-y-5">{shownEntries.map(record => <article key={record.id} className="border-b border-border pb-4"><p className="hoho-text-label">{date(record.occurredAt)} · {types[record.type] ?? record.type}</p><p className="hoho-text-body mt-2 whitespace-pre-wrap break-words">{record.content}</p>{record.note && <p className="hoho-text-caption mt-2 whitespace-pre-wrap">备注：{record.note}</p>}<p className="hoho-text-caption mt-2">{record.authorName} 记录 · 原创建 {date(record.createdAt)}<br />共享于 {date(record.sharedAt)}{record.revisionCount > 0 ? ` · 已保留 ${record.revisionCount} 次更正版本` : ''}</p>{record.attachments.map(attachment => <HohoButton key={attachment.id} variant="text" size="small" disabled={busy} onClick={() => void perform(async () => saveBlob(await familySharingApi.downloadAttachment(token, space.id, record.id, attachment.id), attachment.name))}>查看附件：{attachment.name}</HohoButton>)}</article>)}</div> : <p className="hoho-text-body">还没有发布给家庭的记录。先预览并确认共享一批正式记录。</p>}
        </HohoSection>
        <HohoSection title="共享批次">{space.batches.length ? space.batches.map(batch => <HohoSurfaceRow key={batch.id} title={`${date(batch.createdAt)} · ${batch.count} 条`} description={batch.status === 'withdrawn' ? '已撤回；原个人记录保留' : '已共享，保留来源'} action={batch.status === 'committed' && (batch.accountId === accountId || space.role === 'admin') ? <HohoButton variant="text" size="small" disabled={busy} onClick={() => ask({ title: '撤回这批共享', description: '仅撤回本批在家庭工作区中的内容，个人原记录不受影响；如已有后续更正，会先要求核对。', label: '确认撤回', danger: true, run: async () => { await familySharingApi.withdraw(token, space.id, batch.id); setNotice('已撤回本批共享，个人记录保留') } })}>撤回</HohoButton> : undefined} />) : <p className="hoho-text-caption">暂无共享批次。</p>}</HohoSection>
        {space.audits.length > 0 && <HohoSection title="协作操作记录">{space.audits.map(audit => <p className="hoho-text-caption py-1" key={audit.id}>{date(audit.createdAt)} · {audit.actorName} · {actions[audit.action] ?? '协作操作'}</p>)}</HohoSection>}
      </>}
      {spaceId && !space && !loading && <HohoButton variant="secondary" onClick={() => setParams({})}>回到我的家庭</HohoButton>}
    </main>
    <ConfirmDialog open={Boolean(confirmation)} title={confirmation?.title ?? ''} description={confirmation?.description ?? ''} confirmLabel={confirmation?.label ?? '确认'} danger={confirmation?.danger} loading={busy} onCancel={() => setConfirmation(null)} onConfirm={() => { if (confirmation) void perform(confirmation.run) }} />
  </div>
}

export default FamilySharingPage
