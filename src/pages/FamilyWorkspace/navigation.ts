export type ModuleId = 'finances' | 'assets' | 'legal' | 'schedule' | 'home' | 'health' | 'education' | 'safety' | 'governance'
export type WorkspaceLocation = { module: ModuleId | 'overview' | 'access'; page: string; section?: string }
export type FinanceView = 'overview' | 'balance' | 'monthly' | 'reserve' | 'insurance' | 'goals' | 'forecast'
export type FinancePresentation = { view: FinanceView; balancePart?: 'assets' | 'debts'; assetCategories?: string[]; debtCategories?: string[]; flowMode?: 'actual' | 'budget'; flowPattern?: string; flowKinds?: string[] }
export type WorkspaceSection = { id: string; title: string; description: string; columns: string[]; keywords: string; finance?: FinancePresentation }
export type WorkspacePage = WorkspaceSection & { sections: WorkspaceSection[] }
export type WorkspaceModule = { id: ModuleId; title: string; description: string; pages: WorkspacePage[] }
const section = (id: string, title: string, description: string, columns: string[], keywords = '', finance?: FinancePresentation): WorkspaceSection => ({ id, title, description, columns, keywords, finance })
const page = (id: string, title: string, description: string, columns: string[], keywords = '', sections: WorkspaceSection[] = [], finance?: FinancePresentation): WorkspacePage => ({ ...section(id, title, description, columns, keywords, finance), sections })
const actual: FinancePresentation = { view: 'monthly', flowMode: 'actual' }
const assetList = (categories?: string[]): FinancePresentation => ({ view: 'balance', balancePart: 'assets', assetCategories: categories })

// One canonical editing location per kind of household information. Summary pages only aggregate it.
const modules: WorkspaceModule[] = [
  { id: 'finances', title: '家庭收支与预算', description: '记录实际收支，制定预算与资金计划，并统一查看财务结果。', pages: [
    page('perspective', '财务透视表', '汇总家庭资产、负债、实际收支和储备；具体资料在所属类目维护。', [], '汇总统计 收支报表 财务报表 Excel 资产负债 净资产', [], { view: 'overview' }),
    page('transactions', '收支记录', '维护实际发生的月度收支；固定开支、还本与内部划转在这里分类查看。', [], '记账 流水 工资 餐饮 消费 固定账单', [
      section('actual', '收入与支出', '按月维护实际累计收入和生活支出，尚未核对的金额保持留空。', [], '收入 支出 月度 生活开支', { ...actual, flowKinds: ['income', 'expense'] }),
      section('fixed', '固定开支', '核对房租、通信、保费等固定项目的实际发生金额。', [], '房租 水电 通信 保费 订阅 固定账单', { ...actual, flowPattern: 'fixed', flowKinds: ['expense'] }),
      section('transfers', '还本与内部划转', '还本、储蓄配置和家庭内部转账分别登记，不作为生活消费。', [], '本金 还款 内部转账 储蓄配置', { ...actual, flowKinds: ['repayment', 'saving', 'transfer'] })
    ]),
    page('budget', '预算与资金计划', '把月度额度、未来资金测算和长期资金目标集中在同一处。', [], '预算管理 现金流计划 财务计划 教育金 储蓄目标', [
      section('monthly', '月度预算与执行', '制定各项目计划金额，并对照实际金额查看差额。', [], '月度预算 年度预算 超支 预算差额', { view: 'monthly', flowMode: 'budget' }),
      section('forecast', '现金流测算', '按未来月份汇总已填计划，观察还本和资金配置后的可安排余额。', [], '预计收入 预计支出 现金流 缺口', { view: 'forecast' }),
      section('goals', '资金目标', '跟踪教育、养老或大额购置的目标金额和已备进度。', [], '教育金 养老 储蓄 目标', { view: 'goals' })
    ]),
    page('sharing', '报销与分摊', '管理家庭垫付款和共同费用的结算；实际支付金额在收支记录维护。', [], 'AA 报销 垫付 退款', [
      section('pending', '待结算事项', '确认谁垫付、谁承担以及仍待结算的金额。', ['事项', '垫付人', '承担成员', '待结算金额', '约定日期']),
      section('settled', '结算记录', '保留结算时间、金额与对应事项。', ['结算日期', '关联事项', '支付成员', '接收成员', '结算金额'])
    ])
  ] },
  { id: 'assets', title: '资产负债与投资', description: '资产与负债各自登记一次；账户照片、有效期和估值跟随资产明细。', pages: [
    page('records', '资产明细', '统一维护余额、估值、归属、日期和附件，按资产类别查看。', [], '资产表 资产负债表 银行卡 支付账户 照片 附件 到期', [
      section('all', '全部资产', '查看家庭各类资产，避免同一账户在多处重复录入。', [], '资产明细 资产总额', assetList()),
      section('cash', '现金与存款', '维护现金、银行卡、微信和支付宝等余额及其账户资料。', [], '银行卡 活期 定期 微信 支付宝 现金 支付账户', assetList(['cash', 'deposit'])),
      section('investment', '投资持仓', '记录基金、股票、债券与理财的当前估值。', [], '基金 股票 债券 理财 证券', assetList(['investment'])),
      section('property', '房产', '记录房屋权属、参考估值与对应资料。', [], '房屋 不动产 住房', assetList(['property'])),
      section('vehicle', '车辆', '记录车辆权属、估值与资产资料；用车和保养在居所模块安排。', [], '汽车 车辆估值', assetList(['vehicle'])),
      section('equity', '企业与股权', '记录企业权益的归属和参考价值。', [], '企业 公司 股权 股份', assetList(['equity'])),
      section('receivable', '应收款', '按预计可收回金额记录借出款和其他应收资产。', [], '借出款 借钱 应收款', assetList(['receivable'])),
      section('other', '其他资产', '登记未归入上述类别的资产。', [], '收藏 其他资产', assetList(['other']))
    ]),
    page('liabilities', '负债与还款', '统一维护实际欠款、利率和还款日期；实际还本在收支记录登记。', [], '负债表 房贷 车贷 信用卡 借款', [
      section('all', '全部负债', '查看剩余欠款与还款安排。', [], '欠款 负债', { view: 'balance', balancePart: 'debts' }),
      section('loans', '房贷与车贷', '核对住房和车辆贷款的本金、利率与到期安排。', [], '房贷 车贷 贷款', { view: 'balance', balancePart: 'debts', debtCategories: ['mortgage', 'car'] }),
      section('credit', '信用卡与其他借款', '查看信用卡和其他借款；授信额度不计入资产。', [], '信用卡 消费贷 借款', { view: 'balance', balancePart: 'debts', debtCategories: ['credit', 'loan', 'other'] })
    ]),
    page('reserve', '现金储备', '设置必要开支基线和储备目标，查看来自资产明细的应急资金。', [], '应急金 备用金 现金储备 支持月数', [], { view: 'reserve' }),
    page('investment-plans', '投资配置计划', '记录资产配置意向与复核依据；具体持仓只在资产明细维护。', [], '投资计划 配置 再平衡', [
      section('allocation', '配置计划', '记录资金用途、期限和计划配置。', ['计划名称', '资金用途', '目标期限', '计划比例', '复核日期']),
      section('reviews', '投资复核', '保留配置调整的依据与执行记录。', ['复核日期', '关联计划', '调整依据', '决定', '执行状态'])
    ])
  ] },
  { id: 'legal', title: '税务法律与传承', description: '按申报、合同、法定授权、法律事务和传承安排归档。', pages: [
    page('tax', '税务申报', '整理成员年度申报和支持材料。', [], '个税 报税 退税 专项附加扣除', [
      section('filings', '申报事项', '跟进所属年度、办理期限和状态。', ['所属年度', '申报成员', '申报事项', '截止日期', '状态']),
      section('deductions', '扣除资料', '整理申报需要的扣除项目和支持资料。', ['所属年度', '成员', '项目', '资料位置', '核对状态'])
    ]),
    page('contracts', '合同与协议', '管理已签合同、有效期及履约事项。', [], '合同 租赁 借条 签约', [
      section('register', '合同台账', '登记签约主体、有效期和资料位置。', ['合同名称', '签约主体', '生效日期', '到期日期', '资料位置']),
      section('obligations', '履约与续约', '跟进合同中的办理义务和续约节点。', ['关联合同', '应办事项', '负责人', '期限', '状态'])
    ]),
    page('documents', '证件与法定授权', '管理身份文件、委托书及法定授权；账号恢复归安全模块。', [], '身份证 护照 委托书 公证', [
      section('identity', '证件资料', '记录所属成员、有效期与保管位置。', ['资料名称', '所属成员', '有效期', '保管人', '资料位置']),
      section('authority', '委托与授权', '记录授权范围、被授权人和有效期。', ['授权事项', '授权人', '被授权人', '授权范围', '有效期'])
    ]),
    page('matters', '法律事务', '按具体事项整理经过、证据和处理进展。', [], '纠纷 维权 证据', [
      section('cases', '事务进展', '明确下一步行动与办理期限。', ['事务名称', '相关成员', '下一步', '期限', '状态']),
      section('evidence', '证据与材料', '为各事务整理证据目录与保存位置。', ['关联事务', '材料名称', '材料日期', '保存位置', '备注'])
    ]),
    page('succession', '传承与受益安排', '将遗嘱、信托和受益安排集中管理。', [], '遗产 继承 监护 信托 受益人', [
      section('wills', '遗嘱与意愿', '登记意愿文件、保管位置和复核日期。', ['文件或意愿', '相关成员', '文件日期', '保管位置', '复核日期']),
      section('trusts', '信托安排', '记录信托相关角色、资料和办理节点。', ['安排名称', '委托人', '受托人', '资料位置', '复核日期']),
      section('beneficiaries', '受益人登记', '记录受益安排的依据与文件位置；保单本身归保险模块。', ['安排名称', '安排类型', '相关成员', '受益人', '文件位置'])
    ]),
    page('advisers', '法律与税务顾问', '保留本领域专业联系人的服务范围与联系方式。', ['姓名或机构', '专业领域', '联系方式', '关联事务', '备注'], '律师 会计师 税务师 顾问')
  ] },
  { id: 'schedule', title: '日程与生活安排', description: '用日历查看安排，用待办明确执行，专项事项在所属领域维护。', pages: [
    page('calendar', '家庭日历', '按日期查看共享安排；医疗预约和车辆保养等仍在各自类目管理。', ['开始时间', '结束时间', '安排名称', '参与成员', '地点'], '日历 月历 时间表 行程'),
    page('tasks', '待办与分工', '集中管理临时待办、周期事务和长期责任。', [], '任务 周期安排 责任 分工 家务', [
      section('tasks', '待办清单', '明确单次事项的负责人、期限与状态。', ['事项', '负责人', '截止日期', '优先级', '状态']),
      section('recurring', '周期事务', '记录每周、每月和每年的重复家庭事务。', ['事项', '重复周期', '下次日期', '负责人', '状态']),
      section('responsibility', '长期分工', '明确固定责任、替补人和交接说明。', ['责任事项', '主要负责人', '替补人', '适用周期', '交接说明'])
    ]),
    page('appointments', '接送与生活预约', '协调接送及非医疗生活服务预约。', [], '幼儿园 接送 取件 生活预约', [
      section('pickup', '接送安排', '明确接送对象、时间、地点和负责人。', ['接送对象', '时间', '地点', '负责人', '备注']),
      section('services', '生活预约', '安排维修上门、办事等生活服务。', ['预约事项', '时间', '地点', '负责人', '联系方式'])
    ]),
    page('travel', '旅行与假期', '整理假期、出行意向和行前准备。', [], '旅游 假期 酒店 机票 出差', [
      section('holidays', '假期与行程', '按假期或行程整理日期、目的地和参与成员。', ['假期或行程', '起止日期', '目的地', '参与成员', '计划状态']),
      section('preparation', '行前准备', '将交通、住宿和其他准备事项逐项核对。', ['关联行程', '准备事项', '具体信息', '负责人', '完成状态'])
    ]),
    page('anniversaries', '纪念日', '登记生日、纪念日及准备事项，作为日历的专项来源。', ['日期名称', '相关成员', '日期', '重复规则', '准备事项'], '生日 节日 结婚周年')
  ] },
  { id: 'home', title: '居所物品与家政', description: '管理居所使用、物品维护和服务交接；资产估值归资产模块。', pages: [
    page('spaces', '居所与空间', '整理居住空间、物业和服务信息。', [], '房屋 房间 装修 物业 租房', [
      section('residences', '居所资料', '保存居住地址和物业服务信息，不重复维护房产估值。', ['居所', '地址', '使用状态', '物业联系人', '备注']),
      section('rooms', '房间与空间', '记录空间用途和相关设施。', ['空间名称', '所属居所', '用途', '相关设施', '备注'])
    ]),
    page('inventory', '物品与保修维护', '管理家电、家具等物品的资料、保修和维修；车辆单独管理。', [], '家电 家具 库存 说明书 保修 维修', [
      section('items', '物品台账', '按位置查找物品和说明资料。', ['物品名称', '存放位置', '购入日期', '使用状态', '资料位置']),
      section('warranty', '保修资料', '核对保修期限、服务商和凭证位置。', ['物品名称', '保修到期', '服务商', '联系方式', '凭证位置']),
      section('maintenance', '维修与保养', '安排家电和设施的维修、清洁及定期保养。', ['物品或设施', '维护事项', '上次日期', '下次日期', '服务商'])
    ]),
    page('supplies', '采购与补给', '整理要采购的物品和日常耗材补充计划。', [], '买菜 购物 采购 耗材 囤货', [
      section('shopping', '采购清单', '确认所需物品、预算和负责人。', ['物品名称', '所需数量', '预算', '负责人', '状态']),
      section('replenishment', '耗材补给', '记录补充周期和下次补给安排。', ['耗材名称', '当前储量', '补充周期', '下次日期', '负责人'])
    ]),
    page('vehicles', '车辆使用与养护', '管理车辆使用、保养年检和证照；估值及资产附件归资产明细。', [], '汽车 年检 停车 保养 驾照', [
      section('usage', '日常用车', '记录车辆使用信息和常用服务。', ['车辆', '使用人', '当前里程', '常用服务', '备注']),
      section('maintenance', '保养与年检', '跟进车辆专属保养和年检事项。', ['车辆', '维护事项', '上次日期', '下次日期', '服务商']),
      section('documents', '车辆证照', '核对车辆使用相关证照的期限和保管位置。', ['车辆', '证照名称', '到期日期', '保管位置', '负责人'])
    ]),
    page('domestic', '家政与居家交接', '管理家政服务和居家事务交接；照护说明归健康照护。', [], '保姆 保洁 家政 阿姨 育儿嫂', [
      section('services', '服务安排', '记录家政联系人和服务时间。', ['人员或服务', '服务内容', '服务时间', '联系方式', '状态']),
      section('handoff', '居家交接', '交代钥匙、物品、居家操作和服务注意事项。', ['交接事项', '交接对象', '交接日期', '具体说明', '确认状态'])
    ])
  ] },
  { id: 'health', title: '健康与照护', description: '按健康资料、医疗安排、用药和照护组织信息。', pages: [
    page('profiles', '成员健康档案', '归档病史、过敏信息与检查资料。', [], '病历 过敏 慢性病 报告 疫苗', [
      section('history', '病史与过敏', '整理成员的既往病史与过敏资料。', ['家庭成员', '资料类型', '确认日期', '主要内容', '来源']),
      section('reports', '检查与体检资料', '保存检查和体检资料的索引。', ['家庭成员', '资料名称', '检查日期', '机构', '资料位置']),
      section('vaccines', '接种资料', '归档已有接种记录。', ['家庭成员', '记录日期', '接种项目', '机构', '资料位置'])
    ]),
    page('appointments', '检查与就诊', '协调医疗预约、复诊和陪诊准备。', [], '医院 医生 挂号 体检 复诊 医疗预约', [
      section('visits', '就诊安排', '核对门诊、复诊时间和陪同人。', ['家庭成员', '就诊事项', '预约时间', '机构或科室', '陪同人']),
      section('checkups', '检查与体检安排', '整理检查预约和需要准备的资料。', ['家庭成员', '检查事项', '预约时间', '机构', '准备资料'])
    ]),
    page('medications', '用药与医嘱', '整理实际医嘱与执行记录。', [], '药物 处方 吃药 医嘱', [
      section('instructions', '医嘱资料', '保留医嘱来源和原始说明。', ['家庭成员', '医嘱内容', '开具日期', '来源', '资料位置']),
      section('execution', '用药安排', '根据已登记的实际医嘱整理执行安排。', ['家庭成员', '药品或医嘱', '执行安排', '起止日期', '来源'])
    ]),
    page('care', '照护与交接', '集中管理日常、长辈照护和照护交接。', [], '日常照护 老人照护 长辈 养老 饮食 睡眠', [
      section('daily', '日常照护', '明确持续观察和照护的事项。', ['照护对象', '照护事项', '时间安排', '照护人', '注意事项']),
      section('elders', '长辈照护', '协调长辈支持、陪诊和临时照护。', ['家庭成员', '支持事项', '执行安排', '负责人', '注意事项']),
      section('handoff', '照护交接', '向接手照护的人交代当前情况和注意事项。', ['照护对象', '交接日期', '接手人', '情况说明', '注意事项'])
    ]),
    page('contacts', '医疗与照护联系人', '保留常用医疗机构、医生和照护服务信息；紧急联络顺序归应急预案。', ['姓名或机构', '服务范围', '联系方式', '关联成员', '备注'], '医生 医院 护理 联系人')
  ] },
  { id: 'education', title: '子女教育与成长', description: '管理成长观察、学习活动和儿童责任练习；健康资料归健康照护。', pages: [
    page('milestones', '成长观察', '关注兴趣、能力和成长经历，不重复维护健康测量。', [], '发育 月龄 能力 兴趣 里程碑', [
      section('observations', '日常观察', '记录孩子的兴趣、能力和表现。', ['孩子', '观察日期', '观察维度', '记录内容', '相关资料']),
      section('milestones', '成长里程碑', '留存有意义的成长节点和经历。', ['孩子', '发生日期', '里程碑', '具体经过', '相关资料'])
    ]),
    page('school', '学校与课程', '管理学校事务及需要持续参加的课程。', [], '幼儿园 入学 学校 老师 课程 兴趣班', [
      section('school', '学校事务', '整理学校、老师沟通和学期节点。', ['学校', '孩子', '学期节点', '老师或机构', '待办事项']),
      section('courses', '课程安排', '安排固定课程、兴趣班和相关资料。', ['课程', '孩子', '上课时间', '机构', '注意事项'])
    ]),
    page('activities', '亲子与社会实践', '将亲子互动、体验活动和公益参与按场景整理。', [], '亲子 陪玩 运动 公益 社会参与', [
      section('play', '亲子互动', '整理亲子玩法和互动准备。', ['活动名称', '孩子', '活动时间', '准备事项', '参与情况']),
      section('practice', '兴趣与体验', '安排非固定课程的运动、探索和体验活动。', ['活动名称', '孩子', '活动时间', '准备事项', '体验记录']),
      section('community', '公益与社会参与', '留存志愿、分享、捐赠和社区体验。', ['活动名称', '参与成员', '日期', '参与方式', '体验记录'], '公益 慈善 捐赠 志愿 社区 环保')
    ]),
    page('reading', '阅读与资源', '管理图书与适龄资源，记录使用反馈。', [], '绘本 图书 阅读 学习资源', [
      section('resources', '图书与资源', '按孩子和适龄阶段整理资源。', ['资源名称', '适用孩子', '适龄阶段', '资源类型', '资料位置']),
      section('reading', '阅读与使用记录', '保留阅读和资源使用的实际反馈。', ['孩子', '使用日期', '资源名称', '使用内容', '观察记录'])
    ]),
    page('responsibility', '财商与责任练习', '记录孩子的零花钱练习、选择和责任体验，不作为家庭实际账本。', ['孩子', '练习或责任', '约定目标', '执行周期', '观察记录'], '财商 零花钱 儿童储蓄 家务 责任感')
  ] },
  { id: 'safety', title: '风险安全与应急', description: '统一管理保险、安全检查、账号隐私和应急行动。', pages: [
    page('insurance', '保险与保障', '保单、保费和续费只在这里维护；已发生保费在收支中登记。', [], '医疗险 寿险 意外险 保险 保费 理赔', [
      section('policies', '保单清单', '按被保人整理保单和保障责任。', [], '保单 保险保障 年度保费', { view: 'insurance' }),
      section('claims', '理赔跟进', '按具体理赔事项整理资料和进度。', ['关联保单', '理赔事项', '申请日期', '所需资料', '办理状态'])
    ]),
    page('checks', '安全检查', '集中检查居家、出行和应急物资；具体应急行动另见预案。', [], '风险检查 居家安全 出行安全 应急物资', [
      section('home', '居家安全', '检查居家隐患和防护事项。', ['检查项目', '检查日期', '发现情况', '负责人', '处理状态'], '消防 燃气 防摔'),
      section('travel', '出行安全', '检查出行相关安全准备。', ['检查项目', '适用行程', '检查日期', '负责人', '处理状态'], '儿童座椅 出行'),
      section('supplies', '应急物资', '核对所需物资的位置、数量和期限。', ['物资名称', '存放位置', '数量', '到期日期', '复核日期'], '应急包 物资')
    ]),
    page('privacy', '账号与隐私', '整理数字账号归属、恢复方式和访问授权，不记录明文密码。', [], '数字账号 隐私 账号恢复 防诈骗', [
      section('accounts', '账号归属与恢复', '记录重要账号归属与恢复资料位置。', ['账号或服务', '所属成员', '恢复方式', '资料位置', '复核日期']),
      section('permissions', '访问授权复核', '核对谁有权访问哪些服务和资料。', ['账号或资料', '授权对象', '访问范围', '授权期限', '复核日期'])
    ]),
    page('emergency', '应急预案与联系', '把突发情况下的行动和联络顺序放在一起。', [], '应急预案 紧急联系人 逃生 失联', [
      section('plans', '应急预案', '明确突发场景下的首要行动和资料位置。', ['应急场景', '首要行动', '主要联系人', '资料位置', '复核日期']),
      section('contacts', '紧急联系人', '按成员和应急场景确定联络顺序。', ['联系人', '与家庭关系', '联系电话', '适用场景', '联系顺序'])
    ])
  ] },
  { id: 'governance', title: '家庭治理与关系', description: '明确共同方向、形成决策和沟通约定；执行分工归日程待办。', pages: [
    page('goals', '家庭共同目标', '记录教育、居住和陪伴等共同重点；具体资金目标归预算。', ['目标名称', '目标期限', '相关成员', '下一步行动', '进展'], '年度计划 家庭愿景 优先事项'),
    page('meetings', '会议与决策', '让议题、会议结论和重要决定在一条链路中留存。', [], '家庭会议 周会 月会 重要决策', [
      section('agenda', '待讨论议题', '收集需要共同商议的问题和资料。', ['议题', '提出人', '相关成员', '需讨论日期', '准备资料']),
      section('minutes', '会议记录', '保留讨论结论和后续行动。', ['会议日期', '参与成员', '议题', '形成结论', '后续行动']),
      section('decisions', '重要决策', '记录备选方案、决定和依据，执行任务另入待办。', ['决策事项', '相关成员', '备选方案', '决定日期', '决定与依据'])
    ]),
    page('agreements', '家庭约定与沟通', '保留沟通议题、共同约定和复核安排。', ['约定或议题', '相关成员', '约定内容', '复核日期', '状态'], '关系 陪伴 分歧 沟通 家规'),
    page('archives', '家庭记忆与档案索引', '保存家庭经历并索引已有资料；合同、保单等原资料仍归所属类目。', [], '相册 家庭记忆 文件索引 档案', [
      section('memories', '家庭记忆', '留存重要经历和照片资料位置。', ['经历或资料', '相关成员', '发生日期', '记录内容', '资料位置']),
      section('index', '档案索引', '按用途找到其他类目已经维护的资料。', ['资料名称', '归属类目', '相关成员', '资料日期', '存放位置'])
    ])
  ] }
]

export type PolicyView = 'text' | 'flow' | 'mindmap' | 'checks'
export const policySections: (WorkspaceSection & { id: PolicyView })[] = [
  section('text', '制度正文', '阅读本类制度目标、原则与具体条款。', [], '制度 规则 家规 正文'),
  section('flow', '执行流程', '用带决策分支的流程图明确办理与复盘步骤。', [], '流程图 执行 决策 步骤'),
  section('mindmap', '制度脑图', '从制度章节到条款查看整体关系，并定位正文。', [], '脑图 思维导图 结构'),
  section('checks', '分工与检查', '查看负责人、替补人、完成标准和执行频率图表。', [], '分工 检查 图表 频率 责任')
] as (WorkspaceSection & { id: PolicyView })[]
export const workspaceModules: WorkspaceModule[] = modules.map(module => ({ ...module, pages: [
  page('policy', `${module.title.replace(/^家庭/, '')}制度`, '本类目的家庭制度：原则、分工、执行流程和定期复盘。建议初稿，可逐步修改完善。', [], '制度 家规 规则 约定 流程图 脑图 分工 检查', policySections),
  ...module.pages
] }))

export function pageSections(module: string, pageId: string): WorkspaceSection[] { return workspaceModules.find(item => item.id === module)?.pages.find(item => item.id === pageId)?.sections ?? [] }
export function financePresentation(module: string, pageId: string, sectionId?: string): FinancePresentation | undefined {
  const item = workspaceModules.find(item => item.id === module)?.pages.find(item => item.id === pageId)
  return item?.sections.find(section => section.id === sectionId)?.finance ?? item?.finance
}

const legacyRoutes: Record<string, WorkspaceLocation> = {
  'legal/overview': { module: 'legal', page: 'tax', section: 'filings' },
  'schedule/overview': { module: 'schedule', page: 'calendar' },
  'home/overview': { module: 'home', page: 'spaces', section: 'residences' },
  'health/overview': { module: 'health', page: 'profiles', section: 'history' },
  'education/overview': { module: 'education', page: 'milestones', section: 'observations' },
  'safety/overview': { module: 'safety', page: 'checks', section: 'home' },
  'governance/overview': { module: 'governance', page: 'goals' },
  'finances/overview': { module: 'finances', page: 'perspective' },
  'finances/cashflow': { module: 'finances', page: 'budget', section: 'forecast' },
  'finances/accounts': { module: 'assets', page: 'records', section: 'cash' },
  'finances/bills': { module: 'finances', page: 'transactions', section: 'fixed' },
  'finances/reports': { module: 'finances', page: 'perspective' },
  'assets/overview': { module: 'assets', page: 'records', section: 'all' },
  'assets/cash': { module: 'assets', page: 'records', section: 'cash' },
  'assets/holdings': { module: 'assets', page: 'records', section: 'investment' },
  'assets/property': { module: 'assets', page: 'records', section: 'property' },
  'assets/equity': { module: 'assets', page: 'records', section: 'equity' },
  'assets/allocation': { module: 'assets', page: 'investment-plans', section: 'allocation' },
  'assets/reports': { module: 'finances', page: 'perspective' },
  'legal/trusts': { module: 'legal', page: 'succession', section: 'trusts' },
  'schedule/recurring': { module: 'schedule', page: 'tasks', section: 'recurring' },
  'home/maintenance': { module: 'home', page: 'inventory', section: 'maintenance' },
  'health/elders': { module: 'health', page: 'care', section: 'elders' },
  'education/community': { module: 'education', page: 'activities', section: 'community' },
  'safety/household': { module: 'safety', page: 'checks', section: 'home' },
  'safety/contacts': { module: 'safety', page: 'emergency', section: 'contacts' },
  'governance/roles': { module: 'schedule', page: 'tasks', section: 'responsibility' },
  'governance/decisions': { module: 'governance', page: 'meetings', section: 'decisions' }
}
const perspectiveLegacy: Record<string, WorkspaceLocation> = {
  balance: { module: 'assets', page: 'records', section: 'all' }, monthly: { module: 'finances', page: 'budget', section: 'monthly' },
  reserve: { module: 'assets', page: 'reserve' }, insurance: { module: 'safety', page: 'insurance', section: 'policies' }, goals: { module: 'finances', page: 'budget', section: 'goals' }
}
export const defaultLocation: WorkspaceLocation = { module: 'overview', page: 'overview' }
export const locationHash = (location: WorkspaceLocation) => `#${location.module}/${location.page}${location.section ? `/${location.section}` : ''}`
export function resolveLocation(hash: string, admin: boolean): WorkspaceLocation {
  let [module, pageId, sectionId] = hash.replace(/^#/, '').split('/')
  if (module === 'access') return admin ? { module: 'access', page: 'overview' } : defaultLocation
  const legacy = module === 'finances' && ['perspective', 'overview'].includes(pageId) && perspectiveLegacy[sectionId]
    ? perspectiveLegacy[sectionId] : module === 'assets' && pageId === 'allocation' && sectionId === 'goals'
      ? { module: 'finances', page: 'budget', section: 'goals' } : legacyRoutes[`${module}/${pageId}`]
  if (legacy) { module = legacy.module; pageId = legacy.page; sectionId = legacy.section ?? '' }
  const match = workspaceModules.find(item => item.id === module)
  if (!match) return defaultLocation
  const item = match.pages.find(item => item.id === pageId) ?? match.pages[0]
  const selected = item.sections.find(section => section.id === sectionId) ?? item.sections[0]
  return { module: match.id, page: item.id, ...(selected ? { section: selected.id } : {}) }
}
export function searchWorkspace(query: string) {
  const words = query.normalize('NFKC').trim().toLocaleLowerCase('zh-CN').split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return workspaceModules.flatMap(module => module.pages.flatMap(item => [
    { module, page: item, section: undefined as WorkspaceSection | undefined },
    ...item.sections.map(section => ({ module, page: item, section }))
  ])).map(result => {
    const { module, page: item, section: child } = result
    const title = (child?.title ?? item.title).normalize('NFKC').toLocaleLowerCase('zh-CN')
    const keywords = (child?.keywords ?? item.keywords).normalize('NFKC').toLocaleLowerCase('zh-CN')
    const text = `${module.title} ${item.title} ${title} ${child?.description ?? item.description} ${keywords} ${(child?.columns ?? item.columns).join(' ')}`.normalize('NFKC').toLocaleLowerCase('zh-CN')
    const score = words.every(word => text.includes(word)) ? words.reduce((total, word) => total + (title === word ? 100 : title.includes(word) ? 60 : keywords.includes(word) ? 40 : 10), 0) : 0
    return { ...result, score }
  }).filter(result => result.score > 0).sort((a, b) => b.score - a.score)
}
