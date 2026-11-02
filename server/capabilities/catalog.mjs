// Product-owner requested complete role targets. A registered target is not a
// credential, a validated clinical skill, or permission to practice medicine.
const pediatric = [
 '患儿身份与照护关系核对','儿童分龄理解','儿童与家长沟通','主诉与病史采集','儿科特殊病史采集','用药与过敏信息核对','信息可信度判断','基础医学理解',
 '快速整体观察','生命体征测量与分龄判读','急诊优先级判断','按主诉开展重点评估','危急情况识别与升级','新生儿及高风险儿童识别','疼痛评估','候诊观察与再次分诊','感染预检与隔离引导','检验及报告相关风险沟通',
 '专业记录与病程整理','资料核对与管理','结构化临床交接','就医流程协调','电话及线上接待','家长教育与理解核验','情绪安抚与冲突处理','儿童保护与心理风险识别','特殊需要与无障碍接待','隐私、伦理与职业边界','急救启动与初期协作','突发事件与质量改进'
]
const documentation = [
 '医学术语理解','基础医学理解','服务专科知识','临床问诊结构理解','体格检查语言理解','检查报告理解','药物与操作术语理解','临床表达层级理解','实时听记与转写','多人发言归属','事实与判断分离','否定与不确定表达保留','数值与单位核对','病程时间线重建','重点提炼与完整性平衡','信息澄清与待确认管理','多种医学文书编排','问题导向整理','历史资料检索','多来源资料整合','原件与摘要对照','文书一致性检查','复制与模板风险识别','修改与版本管理','医生复核与签署协作','电子病历系统操作','交接与时限管理','文书质量评价','病例讨论记录','多学科会诊记录','管理会议纪要','决策事项跟踪','临床与管理记录分类','科研原始资料记录','医学文献检索与证据整理','教学与学术材料整理','管理数据与报告编制','专业知识库维护','保密与隐私保护','专业沟通与边界意识','高压与中断管理','持续学习与能力验证'
]
const familyPediatric = new Set([1,2,3,4,5,6,7,19,20,21,23,24,25,27,28])
const familyDocumentation = new Set([1,4,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,27,28,38,39,40,41,42])
const links = {
 communication:['listening','clarification','teachback'],interview:['history','subject','clarification'],
 quality:['uncertainty','source','numbers','correction'],documentation:['source','summary','chronology','correction'],
 handoff:['handoff','summary'],history:['history','chronology'],subject:['subject'],research:[]
}
const domainFor = (title) => /交接|讨论/.test(title)?'handoff':/时间|病程|历史/.test(title)?'history':/沟通|安抚|理解核验|无障碍|澄清/.test(title)?'communication':/核对|可信|否定|数值|判断|质|模板|更正|修改/.test(title)?'quality':/身份|归属/.test(title)?'subject':/问诊|问询|病史|采集/.test(title)?'interview':'documentation'
export const capabilityTargets = [
 ...pediatric.map((title,i)=>({id:`pediatric-${i+1}`,track:'儿童门急诊专业前台',title,applicable:familyPediatric.has(i+1),methodIds:familyPediatric.has(i+1)?links[domainFor(title)]:[],boundary:familyPediatric.has(i+1)?'家庭记录适用范围，非临床资质':'专业角色建设目标；临床评估、分诊或操作须另行建设并验证'})),
 ...documentation.map((title,i)=>({id:`documentation-${i+1}`,track:'高级医学记录助理',title,applicable:familyDocumentation.has(i+1),methodIds:familyDocumentation.has(i+1)?links[domainFor(title)]:[],boundary:familyDocumentation.has(i+1)?'限记录与整理；运行验证和临床审核单独标明':'医院文书、科研或管理扩展目标，当前家庭产品未提供'}))
]

const book = (id,title,url,category='专业教材')=>({id,title,url,category,status:'reference_only',license:'需购买或另行取得内容使用许可',runtimeUse:'not_ingested'})
export const referenceCatalog = [
 ...['人体形态学／人体解剖学','生理学','生物化学','医学微生物学与寄生虫学','医学免疫学','病理学与病理生理学','药理学','预防医学','健康评估','护理学导论','基础护理学'].map((title,i)=>book(`foundation-${i}`,title,'https://www.pmph.com/')),
 book('pediatric-textbook','儿科护理学（第7版）','https://www.pmphmall.com/gdsdetail/644418-322015'),
 book('emergency-textbook','急危重症护理学（第5版）','https://www.pmphmall.com/gdsdetail/645869-323466'),
 book('nursing-psychology','护理心理学（第5版）','https://www.pmphmall.com/gdsdetail/645673-323270'),
 ...['护理人际沟通','护理伦理学','护理管理学','护理研究','临床营养学','精神科护理学','内科学','外科学','医院管理与会议记录'].map((title,i)=>book(`specialty-${i}`,title,'https://www.pmph.com/')),
 book('diagnostics','诊断学（第10版）','https://medu.pmph.com/readdetail/todetail.action?id=32419'),
 book('records-textbook','病案信息学（第3版）','https://www.pmphmall.com/gdsdetail/647129-324726'),
 book('medical-statistics','医学统计学（第8版）','https://www.pmphmall.com/gdsdetail/653097-331694'),
 book('wong','Wong’s Nursing Care of Infants and Children','https://bcen.org/cpen/study-and-prepare/'),
 book('nelson','Nelson Essentials of Pediatrics','https://bcen.org/cpen/study-and-prepare/'),
 book('medical-terms','The Language of Medicine（第13版）','https://shop.elsevier.com/books/the-language-of-medicine/chabner/978-0-443-10779-5'),
 book('bates','Bates’ Guide to Physical Examination and History Taking（第14版）','https://shop.lww.com/Bates--Guide-To-Physical-Examination-and-History-Taking/p/9781975218348'),
 book('ahdi-style','Book of Style & Standards for Clinical Documentation（第4版）','https://ahdionline.org/book-of-style-standards/'),
 book('ahima','Health Information Management Technology: An Applied Approach（第7版）','https://www.ahima.org/academics/education-catalog/health-information-management-technology/'),
 book('aap-protocols','Pediatric Telephone Protocols（第18版）','https://www.aap.org/Pediatric-Telephone-Protocols-18th-Edition-Paperback'),
 ...[['enpc','ENPC 儿科急诊护理课程','https://www.ena.org/education/emergency-nursing-pediatric-course'],['esi','ENA 分诊课程与 ESI Handbook','https://www.ena.org/education/emergency-nursing-triage-education-program/triage-portfolio'],['pals','PALS 儿童高级生命支持','https://cpr.heart.org/en/courses/pals-course-options'],['pears','PEARS 儿童急症评估','https://cpr.heart.org/en/courses/pears-course-options'],['bls','BLS 基础生命支持','https://cpr.heart.org/en/courses'],['etat','WHO ETAT','https://www.who.int/publications/i/item/9241546875']].map(([id,title,url])=>book(id,title,url,'专项课程；未取得培训资质')),
 ...[['record-policy','病历书写基本规范','https://www.nhc.gov.cn/wjw/c100175/201002/b1bec53d90f243e0861529723f00221a.shtml'],['ehr-policy','电子病历应用管理规范（试行）','https://www.beijing.gov.cn/zhengce/zhengcefagui/201905/t20190522_59868.html'],['core-policy','医疗质量安全核心制度要点','https://www.nhc.gov.cn/yzygj/c100068/201804/42ab2552298047679cd6ec733f233862.shtml'],['gcp-policy','药物临床试验质量管理规范（2026年修订）','https://yjj.sh.gov.cn/qtgzwj/20260608/89cbf084b5cb4eab8fd0fb56d8538a1d.html'],['ahdi-qa','Healthcare Documentation Quality Assessment and Management Best Practices（2025）','https://ahdionline.org/wp-content/uploads/2025/06/QABP25-Toolkit-FINAL.pdf']].map(([id,title,url])=>({...book(id,title,url,'规范与质量资料'),license:'仅登记官方来源；未复制全文'}))
]

export const recordingScope = '家庭与儿童健康记录、资料整理和就诊前信息准备。知识不替代患者事实，不提供诊断、治疗剂量、临床分诊等级或操作资质。'
