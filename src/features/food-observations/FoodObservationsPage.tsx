import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, Sprout } from 'lucide-react';
import { WebPageHeader } from '../../components/common/WebPageHeader';
import { BottomSheetSurface, EmptyState, HealthCard, HealthTag, HohoButton, HohoInput, HohoProgress, HohoSection, HohoSurfaceRow, HohoToggle, StatusNotice } from '../../components/design-system';
import { useAppStore } from '../../store/useAppStore';
import { careApi } from '../care-journey/api';
import { observationApi, type FoodObservation, type ObservationList, type ObservationReview, type ObservationSource, type IntakeAnswer, type SymptomAnswer } from './api';
import { observationRange, reviewText } from './model';
import './foodObservations.css';
const message = (error: unknown) => error instanceof Error ? error.message : '本次操作未完成，请重试';
const timestamp = (iso: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short', hour12: false }).format(new Date(iso));
function localInput(iso: string) { const date = new Date(iso); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
const statusLabels = { waiting: '待首次记录', observing: '观察中', due: '待回访', complete: '已汇总', archived: '已结束' };
type Sheet = { kind: 'unlock' | 'add' } | { kind: 'duration' | 'review' | 'detail' | 'next-round' | 'archive'; id: string; version: number };
function Caption({ children }: { children: React.ReactNode }) { return <p className="hoho-text-caption">{children}</p>; }
function Days({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <div className="observation-stack"><div className="observation-presets" aria-label="观察时间选项">{[3, 7, 14, 30].map(days => <HohoButton key={days} size="small" variant={value === String(days) ? 'secondary' : 'ghost'} aria-pressed={value === String(days)} disabled={disabled} onClick={() => onChange(String(days))}>{days}天</HohoButton>)}</div><HohoInput label="观察天数" type="number" inputMode="numeric" min="1" max="365" step="1" value={value} disabled={disabled} onChange={event => onChange(event.target.value)} hint="1至365天，仅对当前食物的本轮观察生效。"/></div>;
}
function Sources({ items, empty, onOpen }: { items: ObservationSource[]; empty: string; onOpen: (source: ObservationSource) => void }) {
  return items.length ? <div className="settings-list">{items.map(source => <HohoSurfaceRow key={source.id} title={source.content || '原始记录'} description={`${timestamp(source.occurredAt)}${source.amount ? ` · ${source.amount}` : ''}`} value="原记录" onActivate={() => onOpen(source)}/>)}</div> : <Caption>{empty}</Caption>;
}
function Summary({ review, name, child, onOpen }: { review: ObservationReview; name: string; child: string; onOpen: (source: ObservationSource) => void }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState('');
  const text = reviewText(name, child, review);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setError(''); } catch { setError('复制未完成，可下载汇总文本。'); } };
  const download = () => { const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `排敏观察-${name}-第${review.round}轮.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  return <HohoSection title={`第${review.round}轮 · ${review.outcome}`} description={observationRange(review.startAt, review.dueAt)}>
    {review.sourceChanged && <StatusNotice tone="warning" title="汇总后原记录有变化">这份汇总保留当时的核对结果，请结合最新原记录查看。</StatusNotice>}
    <div className="settings-list"><HohoSurfaceRow title="家长回访 · 食用情况" description={review.intakeLabel}/><HohoSurfaceRow title="家长回访 · 症状情况" description={review.symptomsLabel}/>{review.note && <HohoSurfaceRow title="家长补充" description={review.note}/>}</div>
    <HohoSection title={`正式食用记录 · ${review.sources.length}条`}><Sources items={review.sources} empty="没有可核对的食用记录。" onOpen={onOpen}/></HohoSection>
    <HohoSection title={`同期间症状记录 · ${review.symptoms.length}条`}><Sources items={review.symptoms} empty="没有相关已保存记录，不代表没有症状。" onOpen={onOpen}/></HohoSection>
    <Caption>{timestamp(review.reviewedAt)}核对。回访来自家长回忆，与逐次保存的记录分别保留；同期间的症状不等同于食物引起的反应。</Caption>
    <div className="observation-between"><HohoButton variant="secondary" size="small" onClick={() => void copy()}>{copied ? '已复制汇总' : '复制汇总'}</HohoButton><HohoButton variant="text" size="small" onClick={download}>下载汇总</HohoButton></div>{error && <StatusNotice title={error} tone="error"/>}
  </HohoSection>;
}
function ObservationSession() {
  const token = useAppStore(s => s.authToken), memberId = useAppStore(s => s.currentMemberId), member = useAppStore(s => s.members.find(m => m.id === s.currentMemberId));
  const navigate = useNavigate(), location = useLocation();
  const [data, setData] = useState<ObservationList | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [sheetError, setSheetError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [filter, setFilter] = useState<'active' | 'history'>('active');
  const [sheet, setSheet] = useState<Sheet | null>(null), [days, setDays] = useState('7'), [name, setName] = useState(''), [hasEaten, setHasEaten] = useState(true), [at, setAt] = useState(localInput(new Date().toISOString())), [amount, setAmount] = useState('');
  const [intake, setIntake] = useState<IntakeAnswer | ''>(''), [symptoms, setSymptoms] = useState<SymptomAnswer | ''>(''), [acknowledge, setAcknowledge] = useState(false), [note, setNote] = useState('');
  const mounted = useRef(true), sequence = useRef(0), busyRef = useRef(false), operationId = useRef(crypto.randomUUID());
  const refresh = useCallback(async (quiet = false) => {
    if (!token || !memberId) { setLoading(false); return; }
    const seq = ++sequence.current;
    if (!quiet) setLoading(true);
    try { const result = await observationApi.list(token, memberId); if (mounted.current && sequence.current === seq && !busyRef.current) { setData(result); setError(''); } }
    catch (cause) { if (mounted.current && sequence.current === seq) setError(message(cause)); }
    finally { if (mounted.current && sequence.current === seq) setLoading(false); }
  }, [token, memberId]);
  useEffect(() => {
    mounted.current = true; void refresh();
    const focus = () => { if (document.visibilityState === 'visible' && !busyRef.current) void refresh(true); };
    const timer = window.setInterval(focus, 60000);
    window.addEventListener('focus', focus); window.addEventListener('hoooho-data-changed', focus); document.addEventListener('visibilitychange', focus);
    return () => { mounted.current = false; sequence.current++; clearInterval(timer); window.removeEventListener('focus', focus); window.removeEventListener('hoooho-data-changed', focus); document.removeEventListener('visibilitychange', focus); };
  }, [refresh]);
  const changed = () => { operationId.current = crypto.randomUUID(); setSheetError(''); };
  const open = (next: Sheet, item?: FoodObservation) => { changed(); setSheet(next); setDays(String(item?.days ?? 7)); setIntake(''); setSymptoms(''); setAcknowledge(false); setNote(''); if (next.kind === 'add') { setName(''); setAmount(''); setHasEaten(true); setAt(localInput(new Date().toISOString())); } };
  const close = () => { if (!busyRef.current) { setSheet(null); setSheetError(''); } };
  const mutate = async (operation: () => Promise<ObservationList>, success: string, keepOpen = false) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setSheetError(''); setError(''); sequence.current++;
    try { const result = await operation(); if (!mounted.current) return; setData(result); setNotice(success); if (!keepOpen) setSheet(null); }
    catch (cause) { if (mounted.current) { if (sheet) setSheetError(message(cause)); else setError(message(cause)); } }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };
  const selected = sheet && 'id' in sheet ? data?.items.find(item => item.id === sheet.id) : null;
  const changeItem = (action: 'duration' | 'review' | 'next-round' | 'archive', extra: Record<string, unknown>) => {
    if (!selected || !sheet || !('version' in sheet) || !token) return;
    return mutate(() => observationApi.change(token, selected.id, action, { memberId, version: sheet.version, requestId: operationId.current, ...extra }), action === 'review' ? '回访已保存，汇总已生成。' : action === 'archive' ? '本轮观察已结束，原始记录保留。' : action === 'next-round' ? '新一轮已建立，待下一次实际食用记录开始计时。' : '本项观察时间已更新。');
  };
  const openSource = (source: ObservationSource) => navigate(`/health-events/${encodeURIComponent(source.eventId)}`, { state: { from: '/food-observations' } });
  const durationValid = Number.isInteger(Number(days)) && Number(days) >= 1 && Number(days) <= 365;
  const selectedStatus = selected?.status;
  const active = data?.items.filter(item => !['complete', 'archived'].includes(item.status)) ?? [];
  const history = data?.items.filter(item => ['complete', 'archived'].includes(item.status)) ?? [];
  const visible = filter === 'active' ? active : history;
  const back = () => { const from = (location.state as { observationFrom?: unknown } | null)?.observationFrom; navigate(typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && from !== '/food-observations' ? from : '/nurse-station'); };
  const unlock = () => { if (!token) return; return mutate(async () => { await careApi.redeem(token, 'food-observation', operationId.current); return observationApi.list(token, memberId); }, '排敏观察已解锁。开启自动观察后，会跟进新食物的正式记录。'); };
  return <main className="app-shell observation-page"><WebPageHeader title="排敏观察" onBack={back} action={<HohoButton className="whitespace-nowrap" size="small" variant="text" disabled={busy || loading || !data} aria-label="添加食物观察" onClick={() => open({ kind: data?.entitlement.active ? 'add' : 'unlock' })}>添加</HohoButton>}/><div className="observation-content">
    {!memberId ? <EmptyState title="先选择一位孩子" description="食物观察会分别记在对应孩子名下。" action={<HohoButton onClick={() => navigate('/health-profile')}>选择孩子</HohoButton>}/> : <>
      <div className="observation-stack"><p className="hoho-text-section-title">帮{member?.name ?? '孩子'}，默默记着</p><Caption>从实际食用开始计时，到期后一起核对这段时间的情况。</Caption></div>
      {loading && !data && <StatusNotice title="正在读取食物观察"/>}
      {error && <StatusNotice tone="error" title={error} action={<HohoButton variant="text" size="small" disabled={busy} onClick={() => void refresh()}>重试</HohoButton>}/>}
      {notice && <StatusNotice tone="success" title={notice}/>}
      {data && <>
        <section className="observation-entitlement observation-stack" aria-label="排敏观察解锁与自动观察"><div className="observation-between"><div className="observation-stack"><h2 className="hoho-text-card-title"><Sprout size={18} aria-hidden="true"/> {data.entitlement.active ? data.automatic ? '自动观察已开启' : '排敏观察已解锁' : '解锁排敏观察'}</h2><Caption>{data.entitlement.active ? data.entitlement.included ? '订阅权益已包含' : `可开启新观察至${timestamp(data.entitlement.expiresAt!)}` : '30个树芽 · 30天内可开启观察'}</Caption></div>{!data.entitlement.active && <HohoButton variant="secondary" size="small" disabled={busy || !data.entitlement.available} onClick={() => open({ kind: 'unlock' })}>解锁</HohoButton>}</div>
          {(data.entitlement.active || data.automatic) && <div className="observation-between"><div><p className="hoho-text-body">自动观察新食物</p><Caption>{!data.entitlement.active ? '使用期已结束，暂停新增；已有观察可继续完成。' : '只跟进开启后保存的新食物记录，不补建旧记录。'}</Caption></div><div aria-busy={busy} className={busy ? 'observation-busy' : ''}><HohoToggle checked={data.automatic} label="自动观察新食物" onChange={enabled => { if (!busy && token) void mutate(() => observationApi.automatic(token, memberId, enabled), enabled ? '自动观察已开启。每种新食物的时间可单独设置。' : '自动观察已关闭，已有观察继续保留。', true); }}/></div></div>}
        </section>
        <div className="observation-tabs" aria-label="观察列表分类">{([{ value: 'active', label: `待排查 ${active.length}` }, { value: 'history', label: `已汇总／结束 ${history.length}` }] as const).map(option => <HohoButton variant={filter === option.value ? 'secondary' : 'ghost'} size="small" aria-pressed={filter === option.value} key={option.value} onClick={() => setFilter(option.value)}>{option.label}</HohoButton>)}</div>
        {data.dueCount > 0 && filter === 'active' && <Caption>{data.dueCount}项已到回访时间，确认后才能生成本轮汇总。</Caption>}
        <div className="observation-stack">{visible.map(item => <HealthCard className="observation-card" key={item.id}>
          <div className="observation-between"><div className="observation-food-title"><Eye size={22} aria-hidden="true"/><div><h2 className="hoho-text-card-title">{item.name}</h2><Caption>{item.origin === 'automatic' ? '自动加入' : '手动加入'} · 第{item.round}轮 · 食用记录{item.sources.length}条</Caption></div></div><HealthTag tone={item.status === 'due' ? 'warning' : 'neutral'}>{statusLabels[item.status]}</HealthTag></div>
          <div className="observation-between observation-time"><span className="hoho-text-caption">{observationRange(item.startAt, item.dueAt)}</span><HohoButton className="observation-days" variant="text" size="small" aria-label={`设置${item.name}观察时间，${item.elapsedDays}／${item.days}天`} onClick={() => open({ kind: ['complete', 'archived'].includes(item.status) ? 'detail' : 'duration', id: item.id, version: item.version }, item)}>{item.elapsedDays}／{item.days}天</HohoButton></div>
          <HohoProgress value={item.elapsedDays} max={item.days} segmented tone="sprout" label={`${item.name}已过${item.elapsedDays}天，共${item.days}天`}/>
          {item.caution && <StatusNotice tone="warning" title={item.caution}/>}
          <HohoButton fullWidth variant={item.status === 'due' ? 'primary' : 'text'} size="small" onClick={() => open({ kind: item.status === 'due' ? 'review' : 'detail', id: item.id, version: item.version }, item)}>{item.status === 'due' ? '确认这段时间的情况' : item.status === 'complete' ? '查看观察汇总' : item.status === 'waiting' ? '查看待开始的观察' : '查看记录与详情'}</HohoButton>
        </HealthCard>)}</div>
        {!visible.length && <EmptyState title={filter === 'history' ? '完成回访后，汇总留在这里' : '还没有待排查的食物'} description={filter === 'history' ? '每一轮记录与家长确认的情况会分别保留。' : data.automatic && data.entitlement.active ? '照常保存新食物的实际饮食记录，就会开始跟进；也可以手动添加。' : '可以手动添加一种食物，或解锁后开启自动观察。'} action={filter === 'active' ? <HohoButton variant="secondary" onClick={() => open({ kind: data.entitlement.active ? 'add' : 'unlock' })}>添加食物观察</HohoButton> : undefined}/>}
        <Caption>这里只整理记录与家长回访，不替代医学判断。观察时间不代表安全周期，请按孩子原有的进食与照护安排进行。</Caption>
      </>}
    </>}
  </div>
  {sheet && <BottomSheetSurface open label={sheet.kind === 'unlock' ? '解锁排敏观察' : sheet.kind === 'add' ? '添加食物观察' : sheet.kind === 'duration' ? `设置${selected?.name ?? ''}观察时间` : sheet.kind === 'review' ? `${selected?.name ?? ''}观察回访` : sheet.kind === 'next-round' ? '开始新一轮观察' : sheet.kind === 'archive' ? '结束本轮观察' : `${selected?.name ?? ''}观察详情`} title={sheet.kind === 'unlock' ? '用树芽解锁排敏观察' : sheet.kind === 'add' ? '添加一种食物' : sheet.kind === 'duration' ? `${selected?.name} · 观察时间` : sheet.kind === 'review' ? `${selected?.name} · 到期回访` : sheet.kind === 'next-round' ? `${selected?.name} · 新一轮` : sheet.kind === 'archive' ? '结束本轮观察' : `${selected?.name} · 观察详情`} onClose={close} footer={sheet.kind === 'detail' ? undefined : <HohoButton fullWidth loading={busy} disabled={!token || (['duration', 'next-round', 'add'].includes(sheet.kind) && !durationValid) || (sheet.kind === 'add' && (!name.trim() || (hasEaten && (!Number.isFinite(Date.parse(at)) || Date.parse(at) > Date.now())))) || (sheet.kind === 'review' && (!intake || !symptoms)) || (sheet.kind === 'unlock' && (!data?.entitlement.available || (data?.entitlement.balance ?? 0) < (data?.entitlement.cost ?? 30)))} onClick={() => {
    if (!token) return;
    if (sheet.kind === 'unlock') void unlock();
    else if (sheet.kind === 'add') void mutate(() => observationApi.create(token, { memberId, name: name.trim(), days: Number(days), requestId: operationId.current, hasEaten, ...(hasEaten ? { occurredAt: new Date(at).toISOString(), amount: amount.trim() } : {}) }), '食物已加入观察。');
    else if (sheet.kind === 'duration') void changeItem('duration', { days: Number(days) });
    else if (sheet.kind === 'next-round') void changeItem('next-round', { days: Number(days) });
    else if (sheet.kind === 'archive') void changeItem('archive', {});
    else if (sheet.kind === 'review') void changeItem('review', { intake, symptoms, acknowledgeSymptoms: acknowledge, note });
  }}>{sheet.kind === 'unlock' ? '确认解锁 · 30个树芽' : sheet.kind === 'review' ? '保存回访并生成汇总' : sheet.kind === 'archive' ? '确认结束' : sheet.kind === 'add' ? hasEaten ? '保存食用记录并开始观察' : '加入列表，待首次食用开始' : '保存'}</HohoButton>}>
    <div className="observation-stack">{sheetError && <StatusNotice tone="error" title={sheetError} action={<HohoButton size="small" variant="text" disabled={busy} onClick={async () => { if (!token) return; try { const next = await observationApi.list(token, memberId); if (!mounted.current) return; setData(next); if ('id' in sheet) { const item = next.items.find(i => i.id === sheet.id); if (item) setSheet({ ...sheet, version: item.version }); } changed(); } catch (cause) { if (mounted.current) setSheetError(message(cause)); } }}>重新读取后核对</HohoButton>}/>}
      {sheet.kind === 'unlock' && data && <><p className="hoho-text-body">30天使用期内可为食物开启观察，手动加入和自动跟进都包含。到期后不新增观察，已有观察仍可完成回访、查看和导出汇总。</p><div className="settings-list"><HohoSurfaceRow title="当前可用树芽" value={`${data.entitlement.balance}个`}/><HohoSurfaceRow title="本次解锁" value="30个树芽／30天"/></div>{data.entitlement.balance < 30 && <StatusNotice title="树芽还不够" action={<HohoButton variant="text" onClick={() => navigate('/care-journey')}>去积累树芽</HohoButton>}/>}<Caption>解锁后可自行开启自动观察，不自动续费。有生效的订阅权益时由服务端直接包含，无需重复兑换。</Caption></>}
      {sheet.kind === 'add' && <><HohoInput label="食物名称" placeholder="例如：南瓜" value={name} maxLength={40} disabled={busy} onChange={event => { setName(event.target.value); changed(); }}/><fieldset className="observation-stack"><legend className="hoho-text-label">孩子已经吃过了吗？</legend>{[{ value: true, label: '已经吃过，保存一次实际食用记录' }, { value: false, label: '还没有，先加入待观察列表' }].map(option => <label className="observation-choice" key={String(option.value)}><input type="radio" name="hasEaten" checked={hasEaten === option.value} disabled={busy} onChange={() => { setHasEaten(option.value); changed(); }}/>{option.label}</label>)}</fieldset>{hasEaten && <><HohoInput label="实际进食时间" type="datetime-local" max={localInput(new Date().toISOString())} value={at} disabled={busy} onChange={event => { setAt(event.target.value); changed(); }} hint="不能晚于现在。以本次实际时间开始，不视为人生首次食用。"/><HohoInput label="食用量（选填）" value={amount} maxLength={100} disabled={busy} onChange={event => { setAmount(event.target.value); changed(); }}/></>}<Days value={days} disabled={busy} onChange={value => { setDays(value); changed(); }}/><Caption>已有过敏或忌口安排的食物，请继续按原安排记录。</Caption></>}
      {(sheet.kind === 'duration' || sheet.kind === 'next-round') && <><Days value={days} disabled={busy} onChange={value => { setDays(value); changed(); }}/><Caption>{sheet.kind === 'next-round' ? '原有汇总会保留。新一轮在下一次实际食用记录后开始，不自动要求继续吃。' : '从本轮首条实际食用记录起计算，修改天数不会删除原记录。满期后仍需回访确认。'}</Caption></>}
      {sheet.kind === 'archive' && <p className="hoho-text-body">结束{selected?.name}的本轮观察。已保存的饮食、症状记录和历史汇总会保留；不会生成“排除过敏”结论。</p>}
      {sheet.kind === 'review' && selected && <><Caption>{observationRange(selected.startAt, selected.dueAt)} · {selected.days}天。请按记忆填写，不确定也可以保留。</Caption><fieldset className="observation-stack"><legend className="hoho-text-card-title">这段时间里，还吃过这种食物吗？</legend>{([{ value: 'daily', label: '几乎每天都吃' }, { value: 'sometimes', label: '又吃过几次' }, { value: 'none', label: '之后没有再吃' }, { value: 'unknown', label: '记不清' }] as const).map(option => <label className="observation-choice" key={option.value}><input type="radio" name="intake" checked={intake === option.value} disabled={busy} onChange={() => { setIntake(option.value); changed(); }}/>{option.label}</label>)}</fieldset><fieldset className="observation-stack"><legend className="hoho-text-card-title">是否观察到新增或加重的情况？</legend>{([{ value: 'none', label: '未观察到新增或加重' }, { value: 'yes', label: '有新增或加重' }, { value: 'unknown', label: '不确定' }] as const).map(option => <label className="observation-choice" key={option.value}><input type="radio" name="symptoms" checked={symptoms === option.value} disabled={busy} onChange={() => { setSymptoms(option.value); changed(); }}/>{option.label}</label>)}</fieldset>{selected.symptoms.length > 0 && <HohoSection title="同期间保存过这些情况"><Sources items={selected.symptoms} empty="" onOpen={openSource}/>{symptoms === 'none' && <label className="observation-choice"><input type="checkbox" checked={acknowledge} disabled={busy} onChange={event => { setAcknowledge(event.target.checked); changed(); }}/>我已核对上述记录，确认未观察到新增或加重</label>}</HohoSection>}<HohoInput label="补充说明（选填）" value={note} maxLength={1000} disabled={busy} onChange={event => { setNote(event.target.value); changed(); }}/><HohoSection title={`食用原记录 · ${selected.sources.length}条`}><Sources items={selected.sources} empty="无可核对的食用记录" onOpen={openSource}/></HohoSection></>}
      {sheet.kind === 'detail' && selected && <>{selected.caution && <StatusNotice tone="warning" title={selected.caution}/>}<Caption>{observationRange(selected.startAt, selected.dueAt)} · {statusLabels[selected.status]}</Caption>{!['complete', 'archived'].includes(selected.status) && <><Sources items={selected.sources} empty="尚无对应的实际食用记录。保存一条饮食记录后会开始计时。" onOpen={openSource}/><HohoSection title="同期间症状记录"><Sources items={selected.symptoms} empty="无相关已保存记录，不代表没有症状。" onOpen={openSource}/></HohoSection><HohoButton variant="secondary" onClick={() => open({ kind: selectedStatus === 'due' ? 'review' : 'duration', id: selected.id, version: selected.version }, selected)}>{selectedStatus === 'due' ? '填写到期回访' : '设置观察时间'}</HohoButton><HohoButton variant="text" onClick={() => open({ kind: 'archive', id: selected.id, version: selected.version }, selected)}>结束本轮观察</HohoButton></>}{[...selected.reviews].reverse().map(review => <Summary key={review.id} review={review} name={selected.name} child={member?.name ?? '孩子'} onOpen={openSource}/>)}{['complete', 'archived'].includes(selected.status) && <HohoButton variant="secondary" disabled={!data?.entitlement.active || Boolean(selected.caution)} onClick={() => open({ kind: 'next-round', id: selected.id, version: selected.version }, selected)}>{data?.entitlement.active ? '开启新一轮观察' : '解锁后可开启新一轮'}</HohoButton>}<Caption>汇总不作医学上的排除或耐受判断，也不会自动修改过敏档案。</Caption></>}
    </div>
  </BottomSheetSurface>}
  </main>;
}
export function FoodObservationsPage() {
  const scope = useAppStore(s => `${s.authUser?.id ?? ''}:${s.currentMemberId}`);
  return <ObservationSession key={scope}/>;
}
