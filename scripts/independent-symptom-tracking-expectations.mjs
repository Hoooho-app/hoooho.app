const fact = (name, fields = {}) => ({ name, polarity: 'affirmed', ...fields })
const step = (facts, fields = {}) => ({ facts, minFacts: facts.length, maxFacts: facts.length, ...fields })
const reject = (reason, fields = {}) => ({ facts: [], minFacts: 0, maxFacts: 0, reject: true, reason, ...fields })
const testCase = (id, member, originalSteps, expectedSteps, fields = {}) => ({
  id,
  member,
  originalSteps,
  executionSteps: originalSteps,
  expectedSteps,
  ...fields
})

export const independentSymptomTrackingCases = [
  testCase('ST-01', 'child', ['今天开始咳嗽。'], [step([
    fact('咳嗽', { type: 'symptom', status: 'active', timeRaw: '今天' })
  ], { uiForbid: ['00:00'] })], { expectation: '咳嗽阳性，人物为测试宝宝A，时间为今天；日期级 UI 不得伪装成 00:00。' }),
  testCase('ST-02', 'child', ['右边小腿疼。'], [step([
    fact('疼痛', { type: 'symptom', bodyPart: '小腿', laterality: 'right' })
  ])], { expectation: '右侧小腿疼痛；小腿粒度和右侧均不可丢失。' }),
  testCase('ST-03', 'child', ['头疼得比较厉害。'], [step([
    fact('头痛', { type: 'symptom', severity: 'severe' })
  ])], { expectation: '头痛且程度为比较厉害/严重。' }),
  testCase('ST-04', 'child', ['今天偶尔会咳两声。'], [step([
    fact('咳嗽', { type: 'symptom', frequency: 'occasional', occurrenceCount: 2, timeRaw: '今天' })
  ], { uiForbid: ['00:00'] })], { expectation: '咳嗽、偶发频率、两声次数信息全部保留；日期级 UI 不得伪装成 00:00。' }),
  testCase('ST-05', 'child', ['今天吐了三次。'], [step([
    fact('呕吐', { type: 'symptom', occurrenceCount: 3, timeRaw: '今天' })
  ], { uiForbid: ['00:00'] })], { expectation: '呕吐三次；日期级 UI 不得伪装成 00:00。' }),
  testCase('ST-06', 'child', ['肚子已经疼了两个小时。'], [step([
    fact('腹痛', { type: 'symptom', bodyPart: '腹部', duration: '2小时' })
  ])], { expectation: '腹痛，部位为腹部，持续两小时。' }),
  testCase('ST-07', 'child', ['这个疹子是前天开始出现的。'], [step([
    fact('皮疹', { type: 'symptom', timeRaw: '前天', resolvedDate: '2026-08-29' })
  ], { uiForbid: ['00:00'] })], { expectation: '皮疹，开始时间为前天（2026-08-29）；日期级 UI 不得伪装成 00:00。' }),
  testCase('ST-08', 'child', ['好像有一点喘。'], [step([
    fact('喘息', { type: 'symptom', polarity: 'uncertain', severity: 'mild' })
  ])], { expectation: '轻微喘息且极性为 uncertain，不能升级为确定阳性。' }),
  testCase('ST-09', 'child', ['体温大概三十八九度。'], [step([
    fact('体温', { type: 'temperature', temperatureMin: 38, temperatureMax: 39 })
  ])], { expectation: '约 38～39℃ 范围，不得压成无依据的单点值。' }),
  testCase('ST-10', 'child', ['鼻子堵，嗓子也疼，但是没有发烧。'], [step([
    fact('鼻塞', { type: 'symptom' }),
    fact('咽喉痛', { type: 'symptom', bodyPart: '咽喉' }),
    fact('发热', { type: 'symptom', polarity: 'negated', status: 'not_applicable' })
  ], { forbidden: [{ name: '发热', polarity: 'affirmed' }] })], { expectation: '鼻塞、咽喉痛和无发热阴性事实全部保留；不得生成发热阳性。' }),
  testCase('ST-11', 'child', ['左边肩膀疼，右边小腿也有点麻。'], [step([
    fact('疼痛', { type: 'symptom', bodyPart: '肩', laterality: 'left' }),
    fact('麻木', { type: 'symptom', bodyPart: '小腿', laterality: 'right' })
  ])], { expectation: '左肩疼痛和右小腿麻木拆分为两条，侧别不得丢失。' }),
  testCase('ST-12', 'child', ['我真的快急死了，孩子一直咳，刚才还吐了两次。'], [step([
    fact('咳嗽', { type: 'symptom' }),
    fact('咳嗽持续', { type: 'status_change', target: '咳嗽', change: 'persistent' }),
    fact('呕吐', { type: 'symptom', occurrenceCount: 2, timeRaw: '刚才', resolvedNearNowMinutes: 10 })
  ], { forbidden: [{ name: '焦虑' }, { name: '急死' }] })], { expectation: '持续咳嗽和刚才呕吐两次；情绪化措辞不是疾病事实。' }),

  testCase('FILTER-01', 'child', ['帮我把刚才的咳嗽改成头疼。'], [reject('编辑指令不得通过快捷记录创建事实')], { expectation: '编辑指令零入库。', safetyGate: true }),
  testCase('FILTER-02', 'child', ['要是明天发烧就麻烦了。'], [reject('假设句不得创建阳性事实', { forbidden: [{ name: '发热', polarity: 'affirmed' }] })], { expectation: '假设句零阳性入库。', safetyGate: true }),
  testCase('FILTER-03', 'child', ['发烧一般是体温超过多少度？'], [reject('医疗知识问句不得创建阳性事实', { forbidden: [{ name: '发热', polarity: 'affirmed' }, { name: '体温', polarity: 'affirmed' }] })], { expectation: '医疗知识问句零阳性入库。', safetyGate: true }),
  testCase('FILTER-04', 'child', ['这会不会是肺炎？'], [reject('诊断担忧问句不得创建肺炎事实', { forbidden: [{ name: '肺炎', polarity: 'affirmed' }] })], { expectation: '肺炎担忧问句零阳性入库。', safetyGate: true }),
  testCase('FILTER-05', 'child', ['今天天气真热。'], [reject('天气闲聊不得创建健康事实')], { expectation: '天气闲聊零入库。', safetyGate: true }),

  testCase('CTX-01', 'child', ['今天早上开始咳嗽。', '现在还在。'], [
    step([fact('咳嗽', { type: 'symptom', timeRaw: '今天早上' })]),
    step([fact('咳嗽持续', { type: 'status_change', target: '咳嗽', change: 'persistent' })])
  ], { expectation: '唯一咳嗽上下文中，“还在”关联咳嗽并形成持续状态。' }),
  testCase('CTX-02', 'child', ['十点头疼得很厉害。', '现在轻一点了。'], [
    step([fact('头痛', { type: 'symptom', severity: 'severe', resolvedHour: 10 })]),
    step([fact('头痛改善', { type: 'status_change', target: '头痛', change: 'improved' })])
  ], { expectation: '唯一头痛上下文中，“轻一点了”形成改善状态。' }),
  testCase('CTX-03', 'child', ['头疼，而且肚子也疼。', '这个好一点了。'], [
    step([fact('头痛', { type: 'symptom' }), fact('腹痛', { type: 'symptom', bodyPart: '腹部' })]),
    reject('两个候选症状下“这个”目标不明确，必须阻止保存或要求补充')
  ], { expectation: '第二步目标含糊，不能擅自关联任一症状。', safetyGateSteps: [1] }),
  testCase('CTX-04', 'child', ['头疼，而且肚子也疼。', '头已经不疼了，肚子还是疼。'], [
    step([fact('头痛', { type: 'symptom' }), fact('腹痛', { type: 'symptom', bodyPart: '腹部' })]),
    step([
      fact('头痛消失', { type: 'status_change', target: '头痛', change: 'resolved' }),
      fact('腹痛持续', { type: 'status_change', target: '腹痛', change: 'persistent' })
    ])
  ], { expectation: '头痛消失与腹痛持续拆分正确。' }),
  testCase('CTX-05', 'child', ['上午起了红疹。', '下午红疹退了。', '晚上又有了。'], [
    step([fact('皮疹', { type: 'symptom', timeRaw: '8月30日上午', resolvedDate: '2026-08-30' })]),
    step([fact('皮疹消失', { type: 'status_change', target: '皮疹', change: 'resolved', timeRaw: '8月30日下午', resolvedDate: '2026-08-30' })]),
    step([fact('皮疹复发', { type: 'status_change', target: '皮疹', change: 'recurred', timeRaw: '8月30日晚上', resolvedDate: '2026-08-30' })])
  ], {
    executionSteps: ['8月30日上午起了红疹。', '8月30日下午红疹退了。', '8月30日晚上又有了。'],
    expectation: '皮疹出现、消失、复发的三步状态链完整。'
  }),
  testCase('CTX-06', 'child', ['三天前开始咳嗽。', '今天量体温37度。', '今天比前两天轻多了。'], [
    step([fact('咳嗽', { type: 'symptom', timeRaw: '三天前', resolvedDate: '2026-08-28' })]),
    step([fact('体温', { type: 'temperature', temperatureMin: 37, temperatureMax: 37, timeRaw: '今天' })]),
    step([fact('咳嗽改善', { type: 'status_change', target: '咳嗽', change: 'improved' })])
  ], { expectation: '跨一条体温记录仍应把“轻多了”关联到此前咳嗽。' }),

  testCase('NEG-01', 'child', ['今天没有发烧。'], [step([
    fact('发热', { type: 'symptom', polarity: 'negated', status: 'not_applicable', timeRaw: '今天' })
  ], { forbidden: [{ name: '发热', polarity: 'affirmed' }], uiForbid: ['00:00'] })], { expectation: '无发热作为阴性病程事实保存，零发热阳性；日期级 UI 不得伪装成 00:00。' }),
  testCase('NEG-02', 'child', ['不发烧，就是一直咳嗽。'], [step([
    fact('发热', { type: 'symptom', polarity: 'negated', status: 'not_applicable' }),
    fact('咳嗽持续', { type: 'status_change', target: '咳嗽', change: 'persistent' })
  ], { maxFacts: 3, forbidden: [{ name: '发热', polarity: 'affirmed' }] })], { expectation: '无发热阴性与持续咳嗽均保存；允许兼容的咳嗽基础观察并存。' }),
  testCase('NEG-03', 'child', ['也不是完全不咳，就是偶尔咳两声。'], [step([
    fact('咳嗽', { type: 'symptom', polarity: 'affirmed', frequency: 'occasional', occurrenceCount: 2 })
  ])], { expectation: '双重否定后为咳嗽阳性，并保留偶尔、两声。' }),
  testCase('NEG-04', 'child', ['今天没有比昨天更严重，差不多还是那样。'], [step([
    fact('症状未加重', { type: 'status_change', change: 'unchanged' })
  ], { forbidden: [{ change: 'worsened' }] })], { expectation: '保留未加重/基本不变的病程状态；零入库最多 PARTIAL。' }),
  testCase('NEG-05', 'child', ['左腿疼，不对，是右腿，左腿没事。'], [step([
    fact('疼痛', { type: 'symptom', bodyPart: '腿', laterality: 'right' }),
    fact('左腿疼痛纠正', { type: 'status_change', laterality: 'left', change: 'corrected', relation: true })
  ], { minFacts: 2, maxFacts: 3, forbidden: [{ name: '疼痛', laterality: 'left', polarity: 'affirmed', current: true }] })], { expectation: '当前有效疼痛在右腿；左腿旧说法明确纠正/阴性并具有修订关系。' }),
  testCase('NEG-06', 'child', ['刚才量的是39度2，不对，我看错了，是38度2。'], [step([
    fact('体温', { type: 'temperature', temperatureMin: 38.2, temperatureMax: 38.2 }),
    fact('体温纠正', { type: 'status_change', change: 'corrected', relation: true })
  ], { minFacts: 1, maxFacts: 2, forbidden: [{ type: 'temperature', temperatureMin: 39.2, polarity: 'affirmed', current: true }] })], { expectation: '当前温度为 38.2℃；39.2℃ 不得继续作为当前有效值。' }),
  testCase('NEG-07', 'child', ['是今天早上开始疼的，哦不是，是昨天晚上就开始了。'], [step([
    fact('疼痛', { type: 'symptom', timeRaw: '昨天晚上', resolvedDate: '2026-08-30' })
  ], { forbidden: [{ timeRaw: '今天早上', current: true }] })], { expectation: '疼痛开始时间纠正为昨天晚上。' }),
  testCase('NEG-08', 'child', ['不是头疼，是头晕，头不疼。'], [step([
    fact('头晕', { type: 'symptom', polarity: 'affirmed' }),
    fact('头痛', { type: 'symptom', polarity: 'negated', status: 'not_applicable' })
  ], { forbidden: [{ name: '头痛', polarity: 'affirmed', current: true }] })], { expectation: '当前有效事实为头晕；头痛为阴性/纠正而非阳性。' }),

  testCase('SPEECH-01', 'child', ['39度2。'], [step([
    fact('体温', { type: 'temperature', temperatureMin: 39.2, temperatureMax: 39.2 })
  ])], { expectation: '文字入口公共事实链路识别 39.2℃；不代表真实麦克风 E2E。' }),
  testCase('SPEECH-02', 'child', ['早上发烧38度。', '又烧了。'], [
    step([fact('发热', { type: 'symptom', timeRaw: '早上' }), fact('体温', { type: 'temperature', temperatureMin: 38, temperatureMax: 38, timeRaw: '早上' })]),
    step([fact('发热复发', { type: 'status_change', target: '发热', change: 'recurred' })], { maxFacts: 2 })
  ], { expectation: '发热 38℃ 后“又烧了”形成复发。' }),
  testCase('SPEECH-03', 'child', ['早上发烧38度。', '不烧了。'], [
    step([fact('发热', { type: 'symptom', timeRaw: '早上' }), fact('体温', { type: 'temperature', temperatureMin: 38, temperatureMax: 38, timeRaw: '早上' })]),
    step([fact('发热消失', { type: 'status_change', target: '发热', change: 'resolved' })], { maxFacts: 2 })
  ], { expectation: '发热 38℃ 后“不烧了”形成消失。' }),
  testCase('SPEECH-04', 'child', ['早上开始头疼。', '好多了。'], [
    step([fact('头痛', { type: 'symptom', timeRaw: '早上' })]),
    step([fact('头痛改善', { type: 'status_change', target: '头痛', change: 'improved' })])
  ], { expectation: '头痛后“好多了”形成改善。' }),
  testCase('SPEECH-05', 'child', ['就是那个，嗯，孩子吧，今天这个咳嗽啊，好像比上午多一点，就这样。'], [step([
    fact('咳嗽加重', { type: 'status_change', target: '咳嗽', change: 'worsened', polarity: 'uncertain' })
  ])], { expectation: '忽略口头填充词，保留孩子咳嗽较上午增多且“好像”的不确定性。' }),
  testCase('SPEECH-07', 'child', ['妈的急死我了，孩子咳得更厉害了，刚刚还吐了一次。'], [step([
    fact('咳嗽加重', { type: 'status_change', target: '咳嗽', change: 'worsened' }),
    fact('呕吐', { type: 'symptom', occurrenceCount: 1, timeRaw: '刚刚', resolvedNearNowMinutes: 10 })
  ], { forbidden: [{ name: '焦虑' }, { name: '辱骂' }] })], { expectation: '咳嗽加重和刚刚呕吐一次；口头情绪词不成事实。' }),
  testCase('SPEECH-08', 'senior', ['娃儿今天蔫巴巴的，身上烫得很，量了39度1。'], [step([
    fact('体温', { type: 'temperature', temperatureMin: 39.1, temperatureMax: 39.1, timeRaw: '今天' })
  ], { minFacts: 1, maxFacts: 2, uiForbid: ['00:00'] })], { expectation: '测试老人C事件中的方言输入至少准确保留 39.1℃，不得写给其他人物；日期级 UI 不得伪装成 00:00。' }),

  testCase('TIME-01', 'child', ['刚刚咳得特别厉害。'], [step([
    fact('咳嗽', { type: 'symptom', severity: 'severe', timeRaw: '刚刚', resolvedNearNowMinutes: 10 })
  ])], { expectation: '严重咳嗽，时间接近提交时刻。' }),
  testCase('TIME-02', 'child', ['昨晚十一点开始肚子疼。'], [step([
    fact('腹痛', { type: 'symptom', bodyPart: '腹部', timeRaw: '昨晚十一点', resolvedDate: '2026-08-30', resolvedHour: 23 })
  ])], { expectation: '腹痛开始于 2026-08-30 23:00。' }),
  testCase('TIME-03', 'child', ['昨晚十一点半开始发烧。', '今天凌晨一点还是38度8。'], [
    step([fact('发热', { type: 'symptom', timeRaw: '昨晚十一点半', resolvedDate: '2026-08-30', resolvedHour: 23, resolvedMinute: 30 })]),
    step([
      fact('体温', { type: 'temperature', temperatureMin: 38.8, temperatureMax: 38.8, timeRaw: '今天凌晨一点', resolvedDate: '2026-08-31', resolvedHour: 1 }),
      fact('发热持续', { type: 'status_change', target: '发热', change: 'persistent' })
    ])
  ], { expectation: '跨午夜时间分别为 8月30日23:30 与 8月31日01:00，持续状态保留。' }),
  testCase('TIME-04', 'child', ['这个疹子从8月29号开始，到今天已经持续三天了。'], [step([
    fact('皮疹', { type: 'symptom', duration: '3天', timeRaw: '8月29', resolvedDate: '2026-08-29', timePrecision: 'day' })
  ])], { expectation: '皮疹从 8月29日开始并持续三天；日期精度不得伪装为精确 00:00。' }),
  testCase('TIME-05', 'child', ['咳嗽已经三天了，不是一直咳，主要是晚上咳。'], [step([
    fact('咳嗽', { type: 'symptom', duration: '3天', frequency: '晚上', polarity: 'affirmed' }),
    fact('持续咳嗽', { type: 'status_change', polarity: 'negated', change: 'persistent' })
  ], { minFacts: 1, maxFacts: 2, forbidden: [{ change: 'persistent', polarity: 'affirmed', current: true }] })], { expectation: '咳嗽三天、主要夜间发生、并非持续不断。' }),
  testCase('TIME-06', 'child', ['明天如果还发烧我再记录。'], [reject('未来条件计划不得创建健康事实', { forbidden: [{ name: '发热', polarity: 'affirmed' }] })], { expectation: '未来条件句零入库。', safetyGate: true }),
  testCase('TIME-07', 'self', ['一跑步就咳，不跑的时候基本不咳。'], [step([
    fact('咳嗽', { type: 'symptom', polarity: 'affirmed', frequency: '跑步' }),
    fact('咳嗽', { type: 'symptom', polarity: 'negated', frequency: '不跑' })
  ], { minFacts: 1, maxFacts: 2 })], { expectation: '本人运动诱发咳嗽，静息时基本不咳；两种上下文不反转。' }),
  testCase('TIME-08', 'senior', ['这几天每天晚上都会头疼，白天基本没事。'], [step([
    fact('头痛', { type: 'symptom', frequency: '每天晚上', polarity: 'affirmed' }),
    fact('头痛', { type: 'symptom', frequency: '白天', polarity: 'negated' })
  ], { minFacts: 1, maxFacts: 2 })], { expectation: '测试老人C的夜间反复头痛与白天无症状上下文保留。' }),

  testCase('TRACK-01', 'child', ['今天早上八点开始发烧，体温38度3。', '十点量到39度1，比早上高了。', '中午十二点降到38度5了。', '下午三点已经不烧了，体温37度2。', '晚上八点又烧到38度8。'], [
    step([fact('发热', { type: 'symptom', resolvedDate: '2026-08-30', resolvedHour: 8 }), fact('体温', { type: 'temperature', temperatureMin: 38.3, temperatureMax: 38.3, resolvedDate: '2026-08-30', resolvedHour: 8 })]),
    step([fact('体温', { type: 'temperature', temperatureMin: 39.1, temperatureMax: 39.1, resolvedDate: '2026-08-30', resolvedHour: 10 }), fact('发热加重', { type: 'status_change', target: '发热', change: 'worsened' })]),
    step([fact('体温', { type: 'temperature', temperatureMin: 38.5, temperatureMax: 38.5, resolvedDate: '2026-08-30', resolvedHour: 12 }), fact('发热改善', { type: 'status_change', target: '发热', change: 'improved' })]),
    step([fact('体温', { type: 'temperature', temperatureMin: 37.2, temperatureMax: 37.2, resolvedDate: '2026-08-30', resolvedHour: 15 }), fact('发热消失', { type: 'status_change', target: '发热', change: 'resolved' })]),
    step([fact('体温', { type: 'temperature', temperatureMin: 38.8, temperatureMax: 38.8, resolvedDate: '2026-08-30', resolvedHour: 20 }), fact('发热复发', { type: 'status_change', target: '发热', change: 'recurred' })])
  ], {
    executionSteps: ['8月30日早上八点开始发烧，体温38度3。', '8月30日上午十点量到39度1，比早上高了。', '8月30日中午十二点降到38度5了。', '8月30日下午三点已经不烧了，体温37度2。', '8月30日晚上八点又烧到38度8。'],
    expectation: '8:00 发热38.3 → 10:00 39.1加重 → 12:00 38.5改善 → 15:00 37.2消失 → 20:00 38.8复发。'
  }),
  testCase('TRACK-02', 'child', ['昨天晚上开始偶尔咳几声。', '今天上午咳得比昨晚频繁了。', '下午一直咳，差不多几分钟就咳一次。', '晚上好多了，现在只是偶尔咳两声。', '睡着以后就没再咳。'], [
    step([fact('咳嗽', { type: 'symptom', frequency: 'occasional', resolvedDate: '2026-08-29' })]),
    step([fact('咳嗽加重', { type: 'status_change', target: '咳嗽', change: 'worsened', frequency: 'frequent' })]),
    step([fact('咳嗽持续', { type: 'status_change', target: '咳嗽', change: 'persistent', frequency: '几分钟' })]),
    step([fact('咳嗽改善', { type: 'status_change', target: '咳嗽', change: 'improved', frequency: 'occasional', occurrenceCount: 2 })]),
    step([fact('咳嗽消失', { type: 'status_change', target: '咳嗽', change: 'resolved' })])
  ], {
    executionSteps: ['8月29日晚上开始偶尔咳几声。', '8月30日上午咳得比昨晚频繁了。', '8月30日下午一直咳，差不多几分钟就咳一次。', '8月30日晚上好多了，现在只是偶尔咳两声。', '8月30日睡着以后就没再咳。'],
    expectation: '偶发 → 频率升高 → 持续且几分钟一次 → 改善为偶尔两声 → 睡后消失。'
  }),
  testCase('TRACK-03', 'self', ['早上起床的时候肚子有点疼，大概三分。', '十一点更疼了，大概有六分。', '下午还是六分左右，没继续加重。', '晚饭以后轻了一些，现在两分。'], [
    step([fact('腹痛', { type: 'symptom', bodyPart: '腹部', severityScale: '3', resolvedDate: '2026-08-30' })]),
    step([fact('腹痛加重', { type: 'status_change', target: '腹痛', change: 'worsened', severityScale: '6', resolvedHour: 11 })]),
    step([fact('腹痛未加重', { type: 'status_change', target: '腹痛', change: 'unchanged', severityScale: '6' })], { forbidden: [{ change: 'worsened' }] }),
    step([fact('腹痛改善', { type: 'status_change', target: '腹痛', change: 'improved', severityScale: '2' })])
  ], {
    executionSteps: ['8月30日早上起床的时候肚子有点疼，大概三分。', '8月30日十一点更疼了，大概有六分。', '8月30日下午还是六分左右，没继续加重。', '8月30日晚饭以后轻了一些，现在两分。'],
    expectation: '腹痛 3分 → 6分加重 → 仍6分未继续加重 → 2分改善。'
  }),
  testCase('TRACK-04', 'child', ['凌晨一点吐了一次。', '凌晨三点又吐了两次。', '从早上开始就没再吐。', '下午四点又吐了一次。'], [
    step([fact('呕吐', { type: 'symptom', occurrenceCount: 1, resolvedDate: '2026-08-30', resolvedHour: 1 })]),
    step([fact('呕吐复发', { type: 'status_change', target: '呕吐', change: 'recurred', occurrenceCount: 2, resolvedHour: 3 })]),
    step([fact('呕吐消失', { type: 'status_change', target: '呕吐', change: 'resolved' })]),
    step([fact('呕吐复发', { type: 'status_change', target: '呕吐', change: 'recurred', occurrenceCount: 1, resolvedHour: 16 })])
  ], {
    executionSteps: ['8月30日凌晨一点吐了一次。', '8月30日凌晨三点又吐了两次。', '8月30日从早上开始就没再吐。', '8月30日下午四点又吐了一次。'],
    expectation: '01:00 吐1次 → 03:00 又吐2次 → 早上停止 → 16:00 复发1次。'
  }),
  testCase('TRACK-05', 'child', ['今天早上发烧38度5，还有一点咳嗽。', '下午体温已经正常了，但是咳嗽比早上厉害。', '晚上没有再发烧，咳嗽还是很多，还开始流鼻涕。'], [
    step([fact('发热', { type: 'symptom' }), fact('体温', { type: 'temperature', temperatureMin: 38.5, temperatureMax: 38.5 }), fact('咳嗽', { type: 'symptom', severity: 'mild' })]),
    step([fact('发热消失', { type: 'status_change', target: '发热', change: 'resolved' }), fact('咳嗽加重', { type: 'status_change', target: '咳嗽', change: 'worsened' })]),
    step([fact('发热', { type: 'symptom', polarity: 'negated', status: 'resolved' }), fact('咳嗽持续', { type: 'status_change', target: '咳嗽', change: 'persistent', frequency: 'frequent' }), fact('流鼻涕', { type: 'symptom' })], { forbidden: [{ name: '发热', polarity: 'affirmed' }] })
  ], {
    executionSteps: ['8月30日早上发烧38度5，还有一点咳嗽。', '8月30日下午体温已经正常了，但是咳嗽比早上厉害。', '8月30日晚上没有再发烧，咳嗽还是很多，还开始流鼻涕。'],
    expectation: '发热/38.5/轻咳 → 退热且咳嗽加重 → 无再发热、咳嗽持续多、加入流鼻涕。'
  }),
  testCase('TRACK-06', 'self', ['昨天开始头疼、恶心，还吐了一次。', '今天不吐了，也不恶心了，但是头还是疼。', '头疼比昨天轻一点。'], [
    step([fact('头痛', { type: 'symptom' }), fact('恶心', { type: 'symptom' }), fact('呕吐', { type: 'symptom', occurrenceCount: 1 })]),
    step([fact('呕吐消失', { type: 'status_change', target: '呕吐', change: 'resolved' }), fact('恶心消失', { type: 'status_change', target: '恶心', change: 'resolved' }), fact('头痛持续', { type: 'status_change', target: '头痛', change: 'persistent' })]),
    step([fact('头痛改善', { type: 'status_change', target: '头痛', change: 'improved' })])
  ], {
    executionSteps: ['8月29日开始头疼、恶心，还吐了一次。', '8月30日不吐了，也不恶心了，但是头还是疼。', '8月30日头疼比昨天轻一点。'],
    expectation: '头痛/恶心/呕吐1次 → 呕吐和恶心消失、头痛持续 → 头痛改善。'
  }),
  testCase('TRACK-07', 'child', ['早上肚脐周围疼。', '下午感觉疼的位置跑到右下腹了。', '现在肚脐周围不疼了，主要是右下腹疼。'], [
    step([fact('疼痛', { type: 'symptom', bodyPart: '肚脐周围' })]),
    step([fact('疼痛', { type: 'symptom', bodyPart: '右下腹', laterality: 'right' })]),
    step([fact('肚脐周围疼痛消失', { type: 'status_change', bodyPart: '肚脐周围', change: 'resolved' }), fact('右下腹疼痛持续', { type: 'status_change', bodyPart: '右下腹', laterality: 'right', change: 'persistent' })])
  ], {
    executionSteps: ['8月30日早上肚脐周围疼。', '8月30日下午感觉疼的位置跑到右下腹了。', '8月30日晚上肚脐周围不疼了，主要是右下腹疼。'],
    expectation: '肚脐周围痛 → 转到右下腹 → 原部位消失、右下腹持续。'
  }),
  testCase('TRACK-08', 'child', ['左胳膊起了一片红疹。', '刚才说错了，不是左胳膊，是右胳膊。'], [
    step([fact('皮疹', { type: 'symptom', bodyPart: '胳膊', laterality: 'left' })]),
    step([fact('皮疹纠正', { type: 'status_change', bodyPart: '胳膊', laterality: 'right', change: 'corrected', relation: true })], { minFacts: 1, maxFacts: 2, forbidden: [{ name: '皮疹', laterality: 'left', polarity: 'affirmed', current: true }] })
  ], { expectation: '当前有效侧别为右，左侧旧事实被 superseded/revised。' }),
  testCase('TRACK-09', 'senior', ['昨天下午开始喉咙疼。', '今天早上还是疼，和昨天差不多。', '下午也没加重，但还没有好。'], [
    step([fact('咽喉痛', { type: 'symptom', bodyPart: '咽喉', resolvedDate: '2026-08-29' })]),
    step([fact('咽喉痛未变', { type: 'status_change', target: '咽喉痛', change: 'unchanged' })]),
    step([fact('咽喉痛持续未加重', { type: 'status_change', target: '咽喉痛', change: 'persistent' })], { forbidden: [{ change: 'worsened' }] })
  ], {
    executionSteps: ['8月29日下午开始喉咙疼。', '8月30日早上还是疼，和昨天差不多。', '8月30日下午也没加重，但还没有好。'],
    expectation: '咽喉痛开始 → 基本不变 → 持续且未加重，不能反转为加重。'
  }),
  testCase('TRACK-10', 'self', ['前天开始头疼。', '昨天一天都没疼。', '今天中午又开始疼了。'], [
    step([fact('头痛', { type: 'symptom', resolvedDate: '2026-08-28' })]),
    step([fact('头痛', { type: 'symptom', polarity: 'negated', status: 'resolved', resolvedDate: '2026-08-29' })]),
    step([fact('头痛复发', { type: 'status_change', target: '头痛', change: 'recurred', resolvedDate: '2026-08-30', resolvedHour: 12 })])
  ], {
    executionSteps: ['8月28日开始头疼。', '8月29日一天都没疼。', '8月30日中午又开始疼了。'],
    expectation: '头痛出现 → 一整天无头痛 → 中午复发。'
  }),
  testCase('TRACK-11', 'senior', ['昨晚拉了五次肚子。', '今天上午拉了两次。', '下午只拉了一次，现在还没有完全好。'], [
    step([fact('腹泻', { type: 'symptom', occurrenceCount: 5, resolvedDate: '2026-08-29' })]),
    step([fact('腹泻改善', { type: 'status_change', target: '腹泻', change: 'improved', occurrenceCount: 2 })]),
    step([fact('腹泻持续改善', { type: 'status_change', target: '腹泻', change: 'persistent', occurrenceCount: 1 })])
  ], {
    executionSteps: ['8月29日晚上拉了五次肚子。', '8月30日上午拉了两次。', '8月30日下午只拉了一次，现在还没有完全好。'],
    expectation: '腹泻 5次 → 2次改善 → 1次但未完全好。'
  }),
  testCase('TRACK-12', 'child', ['昨天开始鼻塞。', '今天鼻塞还在，又开始流鼻涕。', '晚上还多了嗓子疼。'], [
    step([fact('鼻塞', { type: 'symptom', resolvedDate: '2026-08-29' })]),
    step([fact('鼻塞持续', { type: 'status_change', target: '鼻塞', change: 'persistent' }), fact('流鼻涕', { type: 'symptom' })]),
    step([fact('咽喉痛', { type: 'symptom', bodyPart: '咽喉' })])
  ], {
    executionSteps: ['8月29日开始鼻塞。', '8月30日鼻塞还在，又开始流鼻涕。', '8月30日晚上还多了嗓子疼。'],
    expectation: '鼻塞出现并持续，随后加入流鼻涕，再加入咽喉痛；既有事实不丢失。'
  }),

  testCase('PERSON-01', 'child', ['我今天头痛。'], [reject('宝宝事件中的“我”是记录者本人，人物不匹配必须阻断', { forbidden: [{ name: '头痛', polarity: 'affirmed' }] })], { expectation: '人物不匹配整次阻断，宝宝事件零写入。', safetyGate: true }),
  testCase('PERSON-02', 'child', ['宝宝今天发烧38度5，我自己也有点头疼。'], [reject('同一输入包含宝宝和记录者两个主体，必须整次阻断', { forbidden: [{ name: '发热' }, { name: '体温' }, { name: '头痛' }] })], { expectation: '返回多人物拆分提示，无 previewId，不保存宝宝或成人任何部分。', safetyGate: true, expectedErrorCode: 'MULTIPLE_SUBJECTS_NEED_SPLIT' }),
  testCase('PERSON-03', 'child', ['奶奶说宝宝好像有点发烧，但我还没量。'], [step([
    fact('发热', { type: 'symptom', polarity: 'uncertain', subjectText: '宝宝' })
  ], { forbidden: [{ type: 'temperature' }, { name: '发热', polarity: 'affirmed' }] })], { expectation: '奶奶是信息来源，宝宝是主体，发热 uncertain，未测量所以无虚构温度。' }),
  testCase('PERSON-04', 'self', ['我现在头疼。'], [step([
    fact('头痛', { type: 'symptom', polarity: 'affirmed', timeRaw: '现在' })
  ])], { expectation: '本人事件中的“我”正确归属测试成人B。' }),

  testCase('UI-01', 'child', ['今天咳嗽。'], [step([
    fact('咳嗽', { type: 'symptom', timeRaw: '今天' })
  ])], { expectation: '确认按钮快速双击、同幂等键重试和刷新后仅新增一条来源记录及一组事实。', interaction: 'idempotency' }),
  testCase('UI-06', 'child', ['离线重试用例。'], [step([
    fact('咳嗽', { type: 'symptom', timeRaw: '今天' })
  ])], {
    executionSteps: ['今天咳嗽。'],
    expectation: '确认前真实离线：中文错误、零隐藏写入；恢复后重提只生成一次记录。',
    interaction: 'offline'
  }),
  testCase('UI-07', 'child', ['十点体温38度5。'], [
    step([fact('体温', { type: 'temperature', temperatureMin: 38.5, temperatureMax: 38.5, resolvedHour: 10 })]),
    step([fact('体温', { type: 'temperature', temperatureMin: 38.2, temperatureMax: 38.2, resolvedHour: 10, resolvedMinute: 30 })])
  ], {
    executionSteps: ['十点体温38度5。', '十点半体温38度2。'],
    expectation: '连续两次提交分别保留 10:00 38.5℃ 与 10:30 38.2℃，不串换、不覆盖。',
    interaction: 'sequential'
  })
]

export const futureOccurrenceCase = testCase('TIME-FUTURE-01', 'child', ['明确未来时刻的体温事实。'], [
  reject('明确未来事实必须由中文错误阻止，不能回退到提交时刻', { forbidden: [{ type: 'temperature' }, { name: '发热' }] })
], {
  executionSteps: ['9月1日上午十点开始发烧，体温38度5。'],
  expectation: '未来时刻不允许保存、显示中文错误、刷新后零记录。',
  safetyGate: true,
  extra: true
})

export function validateExpectationDataset() {
  const ids = independentSymptomTrackingCases.map((item) => item.id)
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index)
  const invalid = independentSymptomTrackingCases.filter((item) => (
    !item.id || !['child', 'self', 'senior'].includes(item.member)
    || item.executionSteps.length !== item.expectedSteps.length
    || !item.expectation
  ))
  if (independentSymptomTrackingCases.length !== 65) {
    throw new Error(`独立验收数据集必须恰好 65 个用例，当前为 ${independentSymptomTrackingCases.length}`)
  }
  if (duplicateIds.length) throw new Error(`用例 ID 重复：${duplicateIds.join(', ')}`)
  if (invalid.length) throw new Error(`用例结构无效：${invalid.map((item) => item.id).join(', ')}`)
  return { count: independentSymptomTrackingCases.length, ids }
}
