import { useCallback, useEffect, useRef, useState, type ReactNode, type ComponentType } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, ImagePlus, Pill, Sprout, Trash2 } from 'lucide-react';
import { WebPageHeader } from '../../components/common/WebPageHeader';
import { BottomSheetSurface, EmptyState, HohoButton, HohoInput, HohoSection, HohoSurfaceRow, StatusNotice } from '../../components/design-system';
import { useAppStore } from '../../store/useAppStore';
import { medicationReminderService, type MedicationReminderDto } from '../../services/medicationReminders';
import { prepareFoodLabelPhoto } from '../../pages/FoodLabel/preparePhoto';
import { careApi } from '../care-journey/api';
import { careToolsApi, type FoodProductInput, type FoodComparisonResult, type FoodNotice, type HandoffResult, type HandoffScenario, type MedicationTemplate, type ToolResult } from './api';
import { foodSubmissionReady, handoffHtml, selectedFoodProducts } from './model';
import './careTools.css';
const errorMessage = (cause: unknown) => cause instanceof Error ? cause.message : '本次操作未完成，内容仍保留，请重试';
const dateLabel = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short', hour12: false }).format(date); };
function Caption({ children }: {
    children: ReactNode;
}) { return <p className="hoho-text-caption">{children}</p>; }
function useScope() { const token = useAppStore(s => s.authToken), accountId = useAppStore(s => s.authUser?.id ?? ''), memberId = useAppStore(s => s.currentMemberId), member = useAppStore(s => s.members.find(m => m.id === s.currentMemberId)); const key = `${accountId}:${memberId}`; const current = useRef(key); current.current = key; return { token, accountId, memberId, member, key, current }; }
function Frame({ title, children }: {
    title: string;
    children: ReactNode;
}) { const navigate = useNavigate(); return <main className="app-shell care-tools-page"><WebPageHeader title={title} onBack={() => navigate('/care-journey/exchange')}/><div className="care-tools-content">{children}</div></main>; }
function OriginalPhoto({ src, onClose }: {
    src: string;
    onClose: () => void;
}) { return <BottomSheetSurface open label="原始标签照片" title="原始标签照片" onClose={onClose}><img className="care-tools-source-image" src={src} alt="本次食品包装标签原图"/></BottomSheetSurface>; }
function ResultHistory({ kind, memberId, token, onOpen, revision }: {
    kind: ToolResult['kind'];
    memberId: string;
    token: string | null;
    onOpen: (id: string) => void;
    revision: number;
}) { const [items, setItems] = useState<ToolResult[]>([]), [error, setError] = useState(''); useEffect(() => { setItems([]); setError(''); if (!token)
    return; const controller = new AbortController(); careToolsApi.results(token, controller.signal).then(result => setItems(result.items.filter(item => item.kind === kind && item.memberId === memberId))).catch(cause => { if (!controller.signal.aborted)
    setError(errorMessage(cause)); }); return () => controller.abort(); }, [token, memberId, kind, revision]); return <HohoSection title="已保存结果">{error ? <Caption>{error}</Caption> : items.length ? <div className="settings-list">{items.map(item => <HohoSurfaceRow key={item.id} title={item.kind === 'handoff-enhanced' ? item.title : '食品并排对照'} description={dateLabel(item.createdAt)} value="查看" onActivate={() => onOpen(item.id)}/>)}</div> : <Caption>完成后的固定结果会保留在这里，重复打开不扣树芽。</Caption>}</HohoSection>; }
function useSavedResult(kind: ToolResult['kind'], scope: ReturnType<typeof useScope>) { const [query, setQuery] = useSearchParams(), id = query.get('result'), [result, setResult] = useState<ToolResult | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState(''), [revision, setRevision] = useState(0); useEffect(() => { setResult(null); setError(''); if (!scope.token || !id)
    return; const controller = new AbortController(); setLoading(true); careToolsApi.result(scope.token, id, controller.signal).then(item => { if (item.kind !== kind || item.memberId !== scope.memberId)
    throw new Error('这份结果属于另一位孩子，请先选择对应孩子再查看'); setResult(item); }).catch(cause => { if (!controller.signal.aborted)
    setError(errorMessage(cause)); }).finally(() => { if (!controller.signal.aborted)
    setLoading(false); }); return () => controller.abort(); }, [scope.token, scope.key, id, kind, revision]); return { result, loading, error, open: (nextId: string) => setQuery({ result: nextId }), close: () => setQuery({}), retry: () => setRevision(v => v + 1) }; }
function FoodResult({ result, onOriginal }: {
    result: FoodComparisonResult;
    onOriginal: (src: string) => void;
}) { const notice = (row: FoodNotice) => typeof row === 'string' ? row : [...new Set([row.original, row.chinese, row.reason].map(value => value?.trim()).filter(Boolean))].join(' · '); return <><div className="care-tools-sprout"><h2 className="hoho-text-section-title">{result.products.length}件食品，按原文分别核对</h2><Caption>{dateLabel(result.createdAt)} · {result.cost > 0 ? `本次已使用${result.cost}个树芽` : '本次已包含，无需树芽'}</Caption></div><div className="care-tools-comparison"><table className="care-tools-table"><thead><tr>{result.products.map((product, index) => <th key={index}>{product.name}</th>)}</tr></thead><tbody><tr>{result.products.map((product, index) => <td key={index}><strong>配料原文与翻译</strong>{product.ingredients.map((ingredient, n) => <p key={n}>{ingredient.original}{ingredient.chinese && ingredient.chinese !== ingredient.original ? ` / ${ingredient.chinese}` : ''}{ingredient.reason && <><br /><span>{ingredient.reason}</span></>}</p>)}</td>)}</tr><tr>{result.products.map((product, index) => <td key={index}><strong>配料明示</strong>{product.contains.length ? product.contains.map((item, n) => <p key={n}>{notice(item)}</p>) : <p>本次未读到额外的明示提示，不代表不存在。</p>}</td>)}</tr><tr>{result.products.map((product, index) => <td key={index}><strong>厂家警示</strong>{product.advisory.length ? product.advisory.map((item, n) => <p key={n}>{notice(item)}</p>) : <p>本次未读到厂家额外警示，不代表没有交叉接触。</p>}</td>)}</tr><tr>{result.products.map((product, index) => <td key={index}><strong>原图来源</strong><div className="care-tools-photos">{(product.photos ?? []).map((photo, n) => <button key={n} type="button" className="care-tools-photo" onClick={() => onOriginal(photo.dataUrl)} aria-label={`查看${product.name}第${n + 1}张原图`}><img src={photo.dataUrl} alt={`${product.name}标签${n + 1}`}/></button>)}</div><Caption>{product.sourcePhotoCount}张来源照片</Caption></td>)}</tr></tbody></table></div>{Boolean(result.unreadable?.length) && <StatusNotice tone="warning" title="部分食品未完整读出，不参与本次对照">{result.unreadable?.map((item, index) => <p key={index}>{item.name}：{item.message}</p>)}</StatusNotice>}<Caption>“未读到”只指本次可读文字，不代表没有相关成分。保留各自原文与来源，不给出食品安全排名。</Caption></>; }
function FoodComparisonSession() {
    const scope = useScope(), saved = useSavedResult('food-comparison', scope), [products, setProducts] = useState<FoodProductInput[]>([{ name: '食品A', photos: [] }, { name: '食品B', photos: [] }]), [result, setResult] = useState<FoodComparisonResult | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [preparing, setPreparing] = useState(false), [confirmed, setConfirmed] = useState(false), [original, setOriginal] = useState<string | null>(null), [revision, setRevision] = useState(0);
    const input = useRef<HTMLInputElement>(null), activeProduct = useRef(0), requestId = useRef(crypto.randomUUID()), generation = useRef(0), busyRef = useRef(false);
    useEffect(() => { generation.current++; setProducts([{ name: '食品A', photos: [] }, { name: '食品B', photos: [] }]); setResult(null); setError(''); setConfirmed(false); setOriginal(null); setPreparing(false); setBusy(false); busyRef.current = false; requestId.current = crypto.randomUUID(); return () => { generation.current++; }; }, [scope.key]);
    const changed = () => { requestId.current = crypto.randomUUID(); setConfirmed(false); setError(''); };
    const addPhotos = async (files: File[]) => { if (!files.length)
        return; const index = activeProduct.current; if (products[index].photos.length + files.length > 6) {
        setError('每件食品最多6张照片，请先移除或分次选择');
        return;
    } const version = ++generation.current, key = scope.key; setPreparing(true); setError(''); try {
        const photos: {
            dataUrl: string;
        }[] = [];
        for (const file of files)
            photos.push(await prepareFoodLabelPhoto(file));
        if (version === generation.current && key === scope.current.current) {
            changed();
            setProducts(current => current.map((product, i) => i === index ? { ...product, photos: [...product.photos, ...photos] } : product));
        }
    }
    catch (cause) {
        if (version === generation.current)
            setError(errorMessage(cause));
    }
    finally {
        if (version === generation.current)
            setPreparing(false);
    } };
    const submit = async () => { if (!scope.token || !scope.member || busyRef.current || !confirmed || !foodSubmissionReady(products))
        return; const key = scope.key; busyRef.current = true; setBusy(true); setError(''); try {
        const next = await careToolsApi.food(scope.token, { requestId: requestId.current, memberId: scope.memberId, products: selectedFoodProducts(products).map(product => ({ ...product, name: product.name.trim() })) });
        if (scope.current.current === key) {
            setResult(next);
            setRevision(v => v + 1);
        }
    }
    catch (cause) {
        if (scope.current.current === key)
            setError(errorMessage(cause));
    }
    finally {
        if (scope.current.current === key) {
            busyRef.current = false;
            setBusy(false);
        }
    } };
    const visible = saved.result?.kind === 'food-comparison' ? saved.result : result;
    return <Frame title="食品并排对照">{saved.error && <StatusNotice tone="error" title={saved.error} action={<HohoButton variant="text" size="small" onClick={saved.retry}>重试</HohoButton>}/>} {saved.loading ? <StatusNotice title="正在读取已保存对照"/> : visible ? <><FoodResult result={visible} onOriginal={setOriginal}/><HohoButton fullWidth variant="secondary" onClick={() => { setResult(null); saved.close(); changed(); }}>开始另一份对照</HohoButton></> : <><div className="care-tools-stack"><h2 className="hoho-text-section-title">一起看配料，分别核对来源</h2><Caption>{scope.member?.name ?? '请先选择孩子'} · 每件食品1—6张，至少2件、最多3件</Caption></div>{!scope.member && <StatusNotice title="请先在前台选择或添加孩子，再核对食品"/>}{products.map((product, index) => <HohoSection key={index} title={`食品${String.fromCharCode(65 + index)}${index === 2 ? '（可选）' : ''}`}><HohoInput id={`care-food-name-${index}`} label="食品名称" value={product.name} maxLength={60} disabled={busy || preparing} onChange={event => { changed(); setProducts(current => current.map((item, i) => i === index ? { ...item, name: event.target.value } : item)); }}/><div className="care-tools-photos">{product.photos.map((photo, n) => <div className="care-tools-photo" key={n}><button type="button" aria-label={`查看${product.name}照片${n + 1}`} onClick={() => setOriginal(photo.dataUrl)}><img src={photo.dataUrl} alt={`${product.name}标签${n + 1}`}/></button><button type="button" disabled={busy || preparing} onClick={() => { changed(); setProducts(current => current.map((item, i) => i === index ? { ...item, photos: item.photos.filter((_, j) => j !== n) } : item)); }}>移除</button></div>)}</div><HohoButton variant="secondary" fullWidth disabled={busy || preparing || product.photos.length >= 6} onClick={() => { activeProduct.current = index; input.current?.click(); }}><ImagePlus size={17}/>{product.photos.length ? '继续添加标签照片' : '添加配料与厂家警示照片'}</HohoButton>{product.photos.length > 0 && <Caption>已添加{product.photos.length}张；提交后由服务端核对完整性。</Caption>}</HohoSection>)}<input type="file" hidden multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" ref={input} onChange={event => { const files = Array.from(event.target.files ?? []); event.currentTarget.value = ''; void addPhotos(files); }}/>{products.length < 3 && <HohoButton variant="text" fullWidth disabled={busy || preparing} onClick={() => { changed(); setProducts(current => [...current, { name: '食品C', photos: [] }]); }}>增加第3件食品（可选）</HohoButton>}<div className="care-tools-sprout"><div className="care-tools-between"><h3 className="hoho-text-card-title">本次食品并排对照</h3><span className="hoho-text-body"><Sprout size={16} className="inline"/> 5</span></div>{error && <StatusNotice tone="error" title={error}/>}<label className="care-tools-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)}/><span>我确认标签照片与结果将保存到本账户。至少2件完整可靠读出并交付才消费5个树芽；未读项会单列，不参与对照。</span></label><HohoButton fullWidth loading={busy || preparing} disabled={!scope.member || !confirmed || !foodSubmissionReady(products) || busy || preparing} onClick={() => void submit()}>{preparing ? '正在处理照片' : busy ? '正在核对配料与来源' : '确认对照 · 5个树芽'}</HohoButton><Caption>信息不清先补拍，失败不扣树芽；原照片保留，可直接重试。单件食品识别继续免费。</Caption></div></>}<ResultHistory kind="food-comparison" memberId={scope.memberId} token={scope.token} onOpen={saved.open} revision={revision}/>{original && <OriginalPhoto src={original} onClose={() => setOriginal(null)}/>}</Frame>;
}
const scenarioNames: Record<HandoffScenario, string> = { nursery: '入托 / 幼儿园', travel: '外出 / 旅行', temporary: '临时照顾者' };
function CareToolResultsSession() { const scope = useScope(), navigate = useNavigate(), [items, setItems] = useState<ToolResult[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [revision, setRevision] = useState(0); useEffect(() => { setItems([]); setError(''); setLoading(true); if (!scope.token) {
    setLoading(false);
    setError('请登录后查看整理成果');
    return;
} const controller = new AbortController(); careToolsApi.results(scope.token, controller.signal).then(result => setItems(result.items.filter(item => item.memberId === scope.memberId))).catch(cause => { if (!controller.signal.aborted)
    setError(errorMessage(cause)); }).finally(() => { if (!controller.signal.aborted)
    setLoading(false); }); return () => controller.abort(); }, [scope.token, scope.key, revision]); return <Frame title="工具整理成果"><div className="care-tools-sprout"><h2 className="hoho-text-section-title">保存好的成果，随时回来用</h2><Caption>{scope.member?.name ?? '当前孩子'} · 固定结果重复查看不消耗树芽。</Caption></div>{loading ? <StatusNotice title="正在读取整理成果"/> : error ? <StatusNotice title={error} tone="error" action={<HohoButton variant="text" size="small" onClick={() => setRevision(v => v + 1)}>重试</HohoButton>}/> : items.length ? <div className="settings-list">{items.map(item => <HohoSurfaceRow key={item.id} title={item.kind === 'handoff-enhanced' ? item.title : '食品并排对照'} description={dateLabel(item.createdAt)} value="查看" onActivate={() => navigate(`${item.kind === 'food-comparison' ? '/care-tools/food-comparison' : '/care-tools/handoff'}?result=${encodeURIComponent(item.id)}`)}/>)}</div> : <EmptyState title="还没有保存的工具成果" description="食品对照、忌口交接单完成后会收在这里。" action={<HohoButton variant="secondary" onClick={() => navigate('/care-journey/exchange')}>查看树芽兑换</HohoButton>}/>}</Frame>; }
function HandoffView({ result }: {
    result: HandoffResult;
}) { const download = () => { const url = URL.createObjectURL(new Blob([handoffHtml(result)], { type: 'text/html;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'Hoooho-忌口交接单.html'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }; return <><div className="care-tools-sprout"><h2 className="hoho-text-section-title">{result.title}</h2><p className="hoho-text-body">{result.memberName} · {scenarioNames[result.scenario]}</p><Caption>{dateLabel(result.createdAt)} · 固定版本 · {result.cost > 0 ? `已使用${result.cost}个树芽` : '本次已包含'}</Caption></div>{[['已确认忌口', result.avoid], ['暂时回避', result.temporary]].map(([title, values]) => <HohoSection key={title as string} title={title as string}>{(values as string[]).length ? <ul className="care-tools-list">{(values as string[]).map((item, index) => <li key={index}>{item}</li>)}</ul> : <Caption>未额外填写，请向家长核对。</Caption>}</HohoSection>)}<HohoSection title="交叉接触"><p className="hoho-text-body">{result.avoidCrossContact ? '需注意交叉接触，按家长已确认的要求执行。' : '未额外填写交叉接触说明，请向家长核对。'}</p></HohoSection>{Boolean(result.handoffChecklist?.length) && <HohoSection title="本次交接逐项核对"><ul className="care-tools-list">{result.handoffChecklist?.map((item, index) => <li key={index}>{item}</li>)}</ul></HohoSection>}{result.note && <HohoSection title="交接补充"><p className="hoho-text-body whitespace-pre-wrap">{result.note}</p></HohoSection>}<HohoButton fullWidth variant="secondary" onClick={download}><Download size={17}/>下载这份交接单</HohoButton><Caption>固定成果重复打开免费。不自动推荐替代食物或医疗处理。</Caption></>; }
function DietaryHandoffSession() { const scope = useScope(), saved = useSavedResult('handoff-enhanced', scope), navigate = useNavigate(), [scenario, setScenario] = useState<HandoffScenario>('temporary'), [note, setNote] = useState(''), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<HandoffResult | null>(null), [revision, setRevision] = useState(0), requestId = useRef(crypto.randomUUID()), busyRef = useRef(false); useEffect(() => { setResult(null); setError(''); setNote(''); setConfirmed(false); setBusy(false); busyRef.current = false; requestId.current = crypto.randomUUID(); }, [scope.key]); const changed = () => { requestId.current = crypto.randomUUID(); setConfirmed(false); setError(''); }; const submit = async () => { if (!scope.token || !scope.member || !confirmed || busyRef.current)
    return; const key = scope.key; busyRef.current = true; setBusy(true); setError(''); try {
    const next = await careToolsApi.handoff(scope.token, { requestId: requestId.current, memberId: scope.memberId, scenario, note: note.trim(), confirmed: true });
    if (scope.current.current === key) {
        setResult(next);
        setRevision(v => v + 1);
    }
}
catch (cause) {
    if (scope.current.current === key)
        setError(errorMessage(cause));
}
finally {
    if (scope.current.current === key) {
        busyRef.current = false;
        setBusy(false);
    }
} }; const visible = saved.result?.kind === 'handoff-enhanced' ? saved.result : result; return <Frame title="忌口交接增强版">{saved.error && <StatusNotice title={saved.error} tone="error" action={<HohoButton variant="text" size="small" onClick={saved.retry}>重试</HohoButton>}/>} {saved.loading ? <StatusNotice title="正在读取交接结果"/> : visible ? <><HandoffView result={visible}/><HohoButton fullWidth variant="text" onClick={() => { setResult(null); saved.close(); changed(); }}>整理另一份交接单</HohoButton></> : <><div className="care-tools-stack"><h2 className="hoho-text-section-title">让接手照顾的人，少问一遍</h2><Caption>{scope.member?.name ?? '请先选择孩子'} · 从本人已保存的忌口卡整理，不猜测食物。</Caption></div><HohoButton variant="secondary" fullWidth onClick={() => navigate('/dietary-card')}>先核对免费忌口卡</HohoButton><HohoSection title="这次交给谁"><div className="settings-list">{(Object.keys(scenarioNames) as HandoffScenario[]).map(value => <label className="care-tools-check p-3" key={value}><input type="radio" name="handoff-scenario" checked={scenario === value} disabled={busy} onChange={() => { changed(); setScenario(value); }}/><span>{scenarioNames[value]}</span></label>)}</div></HohoSection><HohoInput label="交接补充（选填）" maxLength={1000} value={note} disabled={busy} onChange={event => { changed(); setNote(event.target.value); }} hint="只写本次希望接手者知道的已确认事项。"/><div className="care-tools-sprout"><h3 className="hoho-text-card-title">一份固定交接单 · 10个树芽</h3>{error && <StatusNotice title={error} tone="error" action={<HohoButton variant="text" size="small" onClick={() => navigate('/dietary-card')}>核对免费忌口卡</HohoButton>}/>}<label className="care-tools-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)}/><span>我已核对现有忌口卡，确认按所选场景整理并保存这份固定结果。</span></label><HohoButton fullWidth loading={busy} disabled={!scope.member || !confirmed || busy} onClick={() => void submit()}>确认整理 · 10个树芽</HohoButton><Caption>已有保存忌口项目才能整理。没有内容、失败或未形成有效结果不消费；基础忌口卡继续免费。</Caption></div></>}<ResultHistory kind="handoff-enhanced" memberId={scope.memberId} token={scope.token} onOpen={saved.open} revision={revision}/></Frame>; }
function MedicationTemplatesSession() {
    const scope = useScope(), navigate = useNavigate(), [owned, setOwned] = useState(false), [accessLoaded, setAccessLoaded] = useState(false), [items, setItems] = useState<MedicationTemplate[]>([]), [reminders, setReminders] = useState<MedicationReminderDto[]>([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [revision, setRevision] = useState(0), [reminderId, setReminderId] = useState(''), [label, setLabel] = useState(''), [unlock, setUnlock] = useState(false), [deleting, setDeleting] = useState<MedicationTemplate | null>(null);
    const requestId = useRef(crypto.randomUUID()), unlockId = useRef(crypto.randomUUID()), busyRef = useRef(false);
    useEffect(() => { setBusy(''); busyRef.current = false; setNotice(''); }, [scope.key]);
    useEffect(() => { setItems([]); setReminders([]); setReminderId(''); setLabel(''); setOwned(false); setAccessLoaded(false); setError(''); setLoading(true); requestId.current = crypto.randomUUID(); unlockId.current = crypto.randomUUID(); setUnlock(false); setDeleting(null); if (!scope.token) {
        setLoading(false);
        return;
    } let active = true; Promise.allSettled([careToolsApi.templates(scope.token), scope.member ? medicationReminderService.list(scope.memberId, scope.token) : Promise.resolve([])]).then(([access, plans]) => {
        if(!active) return;
        if(access.status==='fulfilled'){setOwned(access.value.owned);setItems(access.value.items);setAccessLoaded(true)} else setError(errorMessage(access.reason));
        if(plans.status==='fulfilled')setReminders(plans.value.filter(plan=>plan.status==='active'));else if(access.status==='fulfilled')setError('模板已读取，已有用药安排暂时无法读取，请重试');
    }).finally(() => { if (active)
        setLoading(false); }); return () => { active = false; }; }, [scope.token, scope.key, revision]);
    const run = useCallback(async (name: string, operation: () => Promise<unknown>, success: string) => { if (busyRef.current)
        return; const key = scope.key; busyRef.current = true; setBusy(name); setError(''); try {
        await operation();
        if (scope.current.current === key) {
            setNotice(success);
            setUnlock(false);
            setDeleting(null);
            setRevision(v => v + 1);
        }
    }
    catch (cause) {
        if (scope.current.current === key)
            setError(errorMessage(cause));
    }
    finally {
        if (scope.current.current === key) {
            busyRef.current = false;
            setBusy('');
        }
    } }, [scope.key]);
    return <Frame title="用药安排模板">{error && <StatusNotice title={error} tone="error" action={<HohoButton variant="text" size="small" onClick={() => setRevision(v => v + 1)}>重试</HohoButton>}/>} {notice && <StatusNotice title={notice} tone="success"/>}{loading ? <StatusNotice title="正在读取模板与已有安排"/> : <><div className="care-tools-stack"><h2 className="hoho-text-section-title">重复安排，从自己的模板开始</h2><Caption>只保留排程结构，不带入药名、剂量或处方。</Caption></div>{!accessLoaded ? <Caption>请重试读取模板状态，尚未进行任何兑换。</Caption> : !owned ? <div className="care-tools-sprout"><h3 className="hoho-text-card-title">常用安排模板包 · 长期使用</h3><p className="hoho-text-body">从自己已有的提醒保存时间结构。每次新安排仍需重新填写并确认药品、剂量与日期。</p><HohoButton fullWidth onClick={() => setUnlock(true)} disabled={Boolean(busy)}>兑换模板包 · 20个树芽</HohoButton><Caption>手动用药安排继续免费，已有提醒不会因未兑换而停止。</Caption></div> : <><HohoSection title="我的模板">{items.length ? <div className="settings-list">{items.map(item => <div key={item.id}><HohoSurfaceRow leading={<Pill size={20}/>} title={item.label} description={item.structure.mode === 'interval' ? `每${item.structure.intervalHours}小时 · ${item.structure.times.join('、')}` : item.structure.times.join('、')} action={<HohoButton variant="secondary" size="small" onClick={() => navigate(`/medication-reminders?template=${encodeURIComponent(item.id)}`)}>套用</HohoButton>}/><HohoButton variant="text" size="small" disabled={Boolean(busy)} onClick={() => setDeleting(item)}><Trash2 size={14}/>删除模板</HohoButton></div>)}</div> : <Caption>还没有模板，先从自己已确认的用药安排保存一个。</Caption>}</HohoSection><HohoSection title="保存一个排程模板">{reminders.length ? <><div className="settings-list">{reminders.map(plan => <label className="care-tools-check p-3" key={plan.id}><input name="template-source" type="radio" checked={reminderId === plan.id} disabled={Boolean(busy)} onChange={() => { setReminderId(plan.id); requestId.current = crypto.randomUUID(); }}/><span>{plan.plan.medicationName}<br /><small className="hoho-text-caption">{plan.plan.times.join('、')} · 只保存排程结构</small></span></label>)}</div><HohoInput label="模板名称" value={label} maxLength={40} disabled={Boolean(busy)} onChange={event => { setLabel(event.target.value); requestId.current = crypto.randomUUID(); }}/><HohoButton fullWidth loading={busy === 'save'} disabled={!reminderId || !label.trim() || Boolean(busy)} onClick={() => scope.token && void run('save', () => careToolsApi.saveTemplate(scope.token!, { requestId: requestId.current, reminderId, label: label.trim() }), '模板已保存')}>只保存排程结构</HohoButton></> : <EmptyState title="先建立一条自己的用药安排" description="模板从已有安排提取，不自动生成药品与剂量。" action={<HohoButton variant="secondary" onClick={() => navigate('/medication-reminders')}>去用药安排</HohoButton>}/>}</HohoSection></>}<Caption>套用后药品、用量与日期仍需本人核对并确认；模板不会直接建立新提醒。</Caption></>}{unlock && <BottomSheetSurface open label="用药模板包兑换" title="长期拥有用药安排模板包" onClose={() => { if (!busy)
        setUnlock(false); }} footer={<div className="care-tools-stack"><HohoButton fullWidth loading={busy === 'unlock'} disabled={Boolean(busy)} onClick={() => scope.token && void run('unlock', () => careApi.redeem(scope.token!, 'medication-templates', unlockId.current), '模板包已拥有，可以保存排程结构')}>确认兑换 · 20个树芽</HohoButton><HohoButton fullWidth variant="text" disabled={Boolean(busy)} onClick={() => setUnlock(false)}>暂不兑换</HohoButton></div>}><div className="care-tools-stack"><p className="hoho-text-body">本账户长期使用，消费不降低成长等级。基础手动安排继续免费。</p>{error && <StatusNotice title={error} tone="error"/>}</div></BottomSheetSurface>}{deleting && <BottomSheetSurface open label="删除用药模板" title="删除这个模板？" onClose={() => { if (!busy)
        setDeleting(null); }} footer={<HohoButton fullWidth variant="danger" loading={busy === 'delete'} disabled={Boolean(busy)} onClick={() => scope.token && void run('delete', () => careToolsApi.removeTemplate(scope.token!, deleting.id), '模板已删除')}>确认删除模板</HohoButton>}><div className="care-tools-stack"><p className="hoho-text-body">只删除“{deleting.label}”模板，不改变任何已有用药安排。</p>{error && <StatusNotice title={error} tone="error"/>}</div></BottomSheetSurface>}</Frame>;
}
function ScopedTool({ component: Page }: {
    component: ComponentType;
}) { const key = useAppStore(state => `${state.authUser?.id ?? ''}:${state.currentMemberId}`); return <Page key={key}/>; }
export function FoodComparisonPage() { return <ScopedTool component={FoodComparisonSession}/>; }
export function DietaryHandoffPage() { return <ScopedTool component={DietaryHandoffSession}/>; }
export function MedicationTemplatesPage() { return <ScopedTool component={MedicationTemplatesSession}/>; }
export function CareToolResultsPage() { return <ScopedTool component={CareToolResultsSession}/>; }
