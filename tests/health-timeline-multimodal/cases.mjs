const pending = {
  actualTranscript: null,
  actualFacts: [],
  actualTimelineRows: [],
  result: 'NOT_RUN',
  evidence: []
}

const voice = (caseId, fixture, referenceTranscript, expectedFacts, forbiddenFacts = []) => ({
  caseId, modality: 'controlled_audio', fixture, referenceTranscript,
  inputContext: '普通时间轴底部快捷记录；合成或受控扰动语音，不代表真实语言障碍人群',
  expectedFacts, forbiddenFacts, expectedPersistence: '按有效原子事实保存；不保存背景或重复事实',
  expectedSource: 'voice_record', expectedType: 'symptom_or_measurement', expectedStatus: 'confirmed_or_pending', ...pending
})

const text = (caseId, referenceTranscript, expectedFacts, forbiddenFacts = []) => ({
  caseId, modality: 'transcript_text', fixture: `fixtures/text/${caseId}.txt`, referenceTranscript,
  inputContext: '普通时间轴底部快捷记录的文字回退；仅验证转写后文本链路，不计入语音 E2E',
  expectedFacts, forbiddenFacts, expectedPersistence: expectedFacts.length ? '有效事实保存；无效输入零入库' : '零入库',
  expectedSource: 'text_record', expectedType: 'derived_from_fact', expectedStatus: 'confirmed_or_pending', ...pending
})

const photo = (caseId, fixture, expectedFacts, forbiddenFacts = [], context = '普通时间轴图片入口') => ({
  caseId, modality: 'photo', fixture, referenceTranscript: null, inputContext: context,
  expectedFacts, forbiddenFacts, expectedPersistence: '附件与事实保持可追溯；不可可靠识别时只保存附件或零事实',
  expectedSource: 'image_attachment', expectedType: 'image_record', expectedStatus: 'confirmed_or_pending', ...pending
})

const multimodal = (caseId, fixture, referenceTranscript, expectedFacts, forbiddenFacts = []) => ({
  caseId, modality: 'photo_plus_audio', fixture, referenceTranscript,
  inputContext: '同一次普通时间轴添加链路中的图片与语音', expectedFacts, forbiddenFacts,
  expectedPersistence: '冲突显式待确认；来源分别可追溯', expectedSource: 'image_and_voice',
  expectedType: 'multimodal_record', expectedStatus: 'confirmed_or_pending', ...pending
})

export const cases = [
  voice('A01', 'fixtures/audio/A01-mumbled-repeated.wav', '孩……孩子……烧、烧到三十九度二，刚……刚才喂了五毫升布洛芬。', ['发热39.2℃', '布洛芬5毫升'], ['重复发热', '其他药名']),
  voice('A02', 'fixtures/audio/A02-low-elderly.wav', '昨晚咳得厉害，今天早上好一点了。', ['昨晚咳嗽较重', '今早咳嗽减轻'], ['体温', '诊断']),
  voice('A03', 'fixtures/audio/A03-fast-no-punctuation.wav', '今天早上八点三十七度八十点半三十八度五十一点吃了美林五毫升现在还是有点咳但是没吐。', ['08:00 37.8℃', '10:30 38.5℃', '11:00 美林5毫升', '咳嗽', '无呕吐'], ['呕吐阳性', '异常拼接数字']),
  voice('A04', 'fixtures/audio/A04-stutter-correction.wav', '他他他刚才吐了，吐了两次，不不不是三次，是两次。', ['呕吐2次'], ['呕吐3次', '重复记录']),
  voice('A05', 'fixtures/audio/A05-interrupted.wav', '孩子现在呼吸好像有点……', [], ['呼吸困难', '喘息', '确定性严重症状']),
  voice('A06', 'fixtures/audio/A06-clipped.wav', '体温三十八度六。', ['体温38.6℃'], ['体温36℃', '体温86℃']),
  voice('A07', 'fixtures/audio/A07-distant-reverb.wav', '右边胳膊起了一片红疹，很痒。', ['右侧手臂红疹', '瘙痒'], ['过敏诊断', '湿疹诊断', '感染诊断']),
  voice('A08', 'fixtures/audio/A08-baby-cry.wav', '刚量体温38度4，孩子一直哭，奶喝得比平时少。', ['体温38.4℃', '持续哭闹', '进食减少'], ['疼痛诊断', '背景声事实']),
  voice('A09', 'fixtures/audio/A09-tv-background.wav', '孩子现在没有发烧，只是有点咳嗽。', ['无发热', '咳嗽'], ['高烧', '电视建议']),
  voice('A10', 'fixtures/audio/A10-overlap-speakers.wav', '宝宝晚上咳了几次。', ['宝宝咳嗽'], ['成人头痛', '主体污染']),
  voice('A11', 'fixtures/audio/A11-speed-change.wav', '九点体温38度7……十点已经降到37度9。', ['09:00 38.7℃', '10:00 37.9℃', '体温下降'], ['合并数值']),
  voice('A12', 'fixtures/audio/A12-muffled.wav', '鼻子堵，嗓子疼，但是没有发烧。', ['鼻塞', '咽喉疼痛', '无发热'], ['感冒诊断', '发热阳性']),

  text('B01', '39度2。', ['可能体温39.2℃'], ['测量部位']),
  text('B02', '又烧了。', ['发热再次出现'], ['具体温度', '原因']),
  text('B03', '不烧了。', ['发热消退或当前无发热'], ['新发热阳性']),
  text('B04', '好了。', [], ['整个事件康复', '全部症状结束']),
  text('B05', '刚喂了五毫升。', ['用药剂量5毫升且待确认'], ['布洛芬', '美林', '确定药名']),
  text('B06', '娃儿烫得很，量了三十九度一，蔫巴巴的。', ['体温39.1℃', '精神状态差'], ['重复发热']),
  text('B07', '伢儿昨晚吐了两回，今朝没吐了。', ['昨晚呕吐2次', '今天未再呕吐'], ['今天呕吐阳性']),
  text('B08', '妈的急死我了，这孩子从半夜折腾到现在，烧到39度4，吐了两回，刚才人还有点蔫，我都不知道怎么办了。', ['发热39.4℃', '呕吐2次', '精神状态差'], ['死亡', '自伤', '处置建议']),
  text('B09', '就是那个，嗯，孩子吧，怎么说呢，好像就是右边这个胳膊，有点红，然后他老挠，嗯，就这样。', ['右侧手臂发红', '抓挠或瘙痒'], ['皮疹诊断']),
  text('B10', '体温39度6，不对不对，那是昨天的，今天刚才量的是38度6。', ['今天体温38.6℃', '昨天体温39.6℃'], ['当前体温39.6℃']),
  text('B11', '体温大概三十八九度。', ['大约38至39℃或待确认'], ['精确38.9℃']),
  text('B12', '也不是完全不咳，就是偶尔咳两声，没发烧，也没吐。', ['偶尔咳嗽', '无发热', '无呕吐'], ['完全无咳嗽', '发热阳性', '呕吐阳性']),
  text('B13', '比刚才轻一点了。', ['仅在可靠上下文中关联头痛减轻'], ['任意其他症状']),
  text('B14', '刚测oxygen是93，heart rate一百二十八，体温正常。', ['血氧93%', '心率128次/分', '体温正常描述'], ['具体体温数值']),
  text('B15', '十点喂了美林五毫升。', ['10:00 美林5毫升'], ['其他药品']),
  text('B16', '把发热标签换成头痛，顺便把来源改成语音记录。', [], ['发热事实', '头痛事实', '待确认事实']),

  photo('P01', 'fixtures/images/P01-thermometer-38.6.jpg', ['体温38.6℃'], ['测量部位', '测量时间']),
  photo('P02', 'fixtures/images/P02-thermometer-39.1-rotated.jpg', ['体温39.1℃'], ['错误数值']),
  photo('P03', 'fixtures/images/P03-thermometer-glare.jpg', ['数值待确认或不提取'], ['精确38.1℃', '精确38.7℃']),
  photo('P04', 'fixtures/images/P04-severely-blurred.jpg', [], ['具体数值', 'OCR幻觉']),
  photo('P05', 'fixtures/images/P05-size-matrix.json', ['上传与压缩性能记录'], ['直接文件过大错误'], '普通时间轴图片入口；8MB、20MB+、HEIC、高分辨率矩阵'),
  photo('P06', 'fixtures/images/P06-ibuprofen-box.jpg', ['可见布洛芬混悬液'], ['已经服用', '剂量', '时间', '原因']),
  multimodal('P07', 'fixtures/images/P06-ibuprofen-box.jpg + fixtures/audio/P07-dose.wav', '刚才十点二十喂了五毫升。', ['布洛芬', '10:20', '5毫升'], ['包装容量作为剂量']),
  multimodal('P08', 'fixtures/images/P08-two-medicines.jpg + fixtures/audio/P08-left.wav', '刚吃了左边这个五毫升。', ['药品待确认', '5毫升'], ['两种药均已服用']),
  photo('P09', 'fixtures/images/P09-synthetic-lab-report.jpg', ['逐项化验结果'], ['参考范围作为结果', '疾病诊断', '整页OCR摘要']),
  photo('P10', 'fixtures/images/P10-synthetic-prescription.jpg', ['报告记载诊断', '报告日期'], ['Hoooho自行诊断']),
  photo('P11', 'fixtures/images/P11-synthetic-skin.jpg', ['图片附件或待确认皮肤情况'], ['湿疹诊断', '过敏诊断', '感染诊断', '虚构部位']),
  multimodal('P12', 'fixtures/images/P11-synthetic-skin.jpg + fixtures/audio/P12-location.wav', '右胳膊，今天刚发现，特别痒。', ['右侧手臂', '今天发现', '瘙痒'], ['具体疾病诊断']),
  photo('P13', 'fixtures/images/P13-unrelated-desk.jpg', [], ['饮食记录', '症状', '待确认症状']),
  photo('P14', 'fixtures/images/P14-chat-screenshot.jpg', ['他人转述或待确认体温38.5℃'], ['用户亲自测量']),
  photo('P15', 'fixtures/images/P01-thermometer-38.6.jpg', ['一次附件与一次事实'], ['重复附件', '重复事实'], '连续两次选择同一图片并快速点击'),
  photo('P16', 'fixtures/images/P16-sequence.json', ['三图各自正确关联'], ['串图', '错序', '错绑']),
  photo('P17', 'fixtures/images/P17-failure-matrix.json', [], ['空记录', '无标题卡片', '重复上传']),
  photo('P18', 'fixtures/images/P18-performance.json', ['预览、压缩、上传、AI、列表耗时'], ['页面假死']),

  multimodal('M01', 'fixtures/images/P01-thermometer-38.6.jpg + fixtures/audio/M01-39.6.wav', '刚量的是39度6。', ['数值冲突或待确认'], ['两个确定测量结果']),
  multimodal('M02', 'fixtures/images/M02-glare-ocr-39.8.jpg + fixtures/audio/M02-correction.wav', '照片反光了，实际是38度8。', ['最终有效值38.8℃', '保留图片与原始OCR'], ['最终39.8℃']),
  multimodal('M03', 'fixtures/images/P06-ibuprofen-box.jpg + fixtures/audio/M03-acetaminophen.wav', '刚才吃的是对乙酰氨基酚。', ['来源冲突'], ['确定布洛芬服用']),
  multimodal('M04', 'fixtures/images/M04-thermometer-38.7.jpg + fixtures/audio/M04-vague.wav', '大概三十八度吧。', ['图片精确38.7℃并保留语音模糊性'], ['语音伪精确值']),
  multimodal('M05', 'fixtures/images/P13-unrelated-desk.jpg + fixtures/audio/M05-vomit.wav', '孩子刚才吐了两次。', ['呕吐2次'], ['无关图片事实']),
  multimodal('M06', 'fixtures/images/P06-ibuprofen-box.jpg + fixtures/audio/M06-two-doses.wav', '昨晚十点吃了五毫升，今天早上八点又吃了五毫升。', ['昨晚22:00 5毫升', '今早08:00 5毫升'], ['一次10毫升'])
]

export const requiredCaseFields = [
  'caseId', 'modality', 'fixture', 'referenceTranscript', 'inputContext', 'expectedFacts', 'forbiddenFacts',
  'expectedPersistence', 'expectedSource', 'expectedType', 'expectedStatus', 'actualTranscript', 'actualFacts',
  'actualTimelineRows', 'result', 'evidence'
]
