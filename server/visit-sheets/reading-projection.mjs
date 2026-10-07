// A source-linked reading projection, not a second parser or diagnosis engine.
export function readingProjection(report, input) {
    const sources = new Map(report.sources.map(s => [s.id, s]));
    const records = new Map(input.records.map(r => [`record:${r.id}`, r]));
    const latest = report.focusSourceIds.map(id => sources.get(id)).filter(Boolean).sort((a, b) => (Date.parse(b.occurredAt) || 0) - (Date.parse(a.occurredAt) || 0))[0];
    const symptom = records.get(latest?.id)?.journal?.symptom;
    const notes = report.caseDetails ?? {};
    const onset = { just_now: '刚刚', today: '当天', yesterday: '前一天', two_three_days: '两三天前', within_week: '一周内', earlier: '更早' }[symptom?.onsetApprox];
    const change = { improving: '家长记录有所减轻', more_noticeable: '家长记录更明显', same: '家长记录变化不大', unclear: '变化尚不确定', returned: '家长记录再次出现', recurrent: '家长记录反复出现' }[symptom?.trend];
    const course = report.chapters.find(c => c.id === 'course');
    const courseIds = [...new Set(course.blocks.filter(b => !b.secondary).flatMap(b => b.sourceIds))].filter(id => {
        const s = sources.get(id);
        return s && s.category !== 'attachment' && !s.category.endsWith('-plan') && (s.recordId || s.identity === '家长执行确认');
    });
    const growth = report.chapters.find(c => c.id === 'growth');
    const measurement = unit => growth.blocks.filter(b => b.unit === unit).flatMap(b => b.points ?? []).filter(p => p.value > 0 && p.detail !== '待核对').sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null;
    return {
        description: notes.description || latest?.narrative || latest?.title || '本次情况待补充',
        onset: notes.onset || records.get(latest?.id)?.journal?.timeLabel || (onset ? `家长在相关记录中填写：${onset}开始（相对于该记录时间）` : '具体起病时间待补充'),
        change: notes.change || change || '最近变化待补充',
        other: notes.other || symptom?.associatedSymptoms?.join('、') || '其他表现未填写',
        sourceIds: latest ? [latest.id] : [], courseSourceIds: courseIds,
        height: measurement('cm'), weight: measurement('kg'),
    };
}
