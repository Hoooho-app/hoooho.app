export interface KnowledgeSection {
  title?: string
  paragraphs: readonly string[]
  items?: readonly string[]
}

export interface KnowledgeArticle {
  id: string
  version: number
  status: 'draft' | 'published'
  publishedAt: string
  title: string
  readingMinutes: number
  sections: readonly KnowledgeSection[]
  sources: readonly { title: string; organization: string; url: string; checkedAt: string }[]
}

// Publishing is explicit. New drafts do not enter the daily selection or reader.
// checkedAt records source verification, not a claim of clinician review.
export const KNOWLEDGE_ARTICLES: readonly KnowledgeArticle[] = [{
  id: 'positive-test-and-food-avoidance',
  version: 1,
  status: 'published',
  publishedAt: '2026-10-17',
  title: '过敏检测阳性，就一定要忌口吗？',
  readingMinutes: 3,
  sections: [
    { paragraphs: [
      '看到报告上的“阳性”，很多家长的第一个念头是：这个不能吃了，那个是不是也得停？原本熟悉的一日三餐，突然变得处处需要犹豫。',
      '这时候，可以先弄清楚：这份报告发现了什么，还需要结合什么来判断。'
    ] },
    { title: '阳性结果，需要和孩子的实际反应一起看。', paragraphs: [
      '这里说的是皮肤点刺试验和食物特异性 IgE 血检。它们可以提供过敏相关线索，但单独一个阳性结果，还不能确诊食物过敏。医生还需要了解孩子过去吃过什么、吃完有没有出现反应，以及反应的具体经过。',
      '报告上的数值，也不能直接当成下一次反应严重程度的刻度。判断孩子是否过敏、需要怎样管理，要结合病史和必要的进一步评估。'
    ] },
    { title: '家长能提供的，是报告之外的那段经历。', paragraphs: [
      '复诊时，医生可能会问：吃的是哪种食物？吃了多少？过了多久出现变化？持续了多久？做过什么处理？',
      '这些问题，过几天再回忆，确实容易记混。可以在事情发生后，顺手留下四类信息：'
    ], items: [
      '吃了什么：食物名称、大概的量，以及能记得的主要配料。',
      '时间经过：什么时候吃，什么时候开始出现变化。',
      '具体表现：哪里不舒服、什么样子、持续多久；有皮肤变化时，可以保留照片。',
      '后续处理：采取了什么措施，之后有什么变化。'
    ] },
    { paragraphs: ['不需要写成一篇病历。几句真实、具体的话，就能帮助医生了解经过。记不清的地方可以写“时间不确定”，保留这个不确定性，也有价值。'] },
    { title: '那现在到底要不要停？', paragraphs: [
      '已经由医生明确诊断、安排回避的食物，继续按照原有方案管理。如果是刚拿到一份新的阳性报告，可以带着饮食和反应记录，请医生明确：哪些需要回避，哪些还需要进一步判断。',
      '需要通过口服食物激发试验确认时，应在专业人员监护下进行，避免在家自行试吃验证。',
      '下次复诊，你可以直接问这三个问题：'
    ], items: [
      '这一项目前是已经确诊，还是需要进一步评估？',
      '孩子现在具体需要避开什么？',
      '什么时候复查，再评估能不能吃？'
    ] },
    { paragraphs: ['今天可以做的一件小事，是把报告和已经发生过的反应记录放在一起。下一次见医生时，你就多了一份能说清楚的资料。'] }
  ],
  sources: [
    { title: 'Diagnosing Food Allergies in Children', organization: '美国儿科学会', url: 'https://www.healthychildren.org/English/healthy-living/nutrition/Pages/Diagnosing-Food-Allergies-in-Children.aspx', checkedAt: '2026-10-17' },
    { title: 'Food Allergy Testing', organization: '美国国家医学图书馆 · MedlinePlus', url: 'https://medlineplus.gov/lab-tests/food-allergy-testing/', checkedAt: '2026-10-17' }
  ]
}, {
  id: 'eczema-observation-beyond-redness',
  version: 1,
  status: 'published',
  publishedAt: '2026-10-19',
  title: '湿疹反复，除了红不红，还该记录什么？',
  readingMinutes: 3,
  sections: [
    { paragraphs: [
      '“昨天看着淡了，今天怎么又抓个不停？”孩子已经确诊湿疹，家长常用“红不红”判断好坏。但一张照片只能留住外观，瘙痒、睡眠和变化经过，也值得一起告诉医生。这里谈的是湿疹的日常观察；尚未确诊的皮疹，需要先请医生辨别。'
    ] },
    { title: '反复出现，不等于每次都吃错了。', paragraphs: [
      '湿疹与皮肤屏障功能有关：皮肤不容易留住水分，也更容易受到外界刺激。它本来就可能时好时坏。炎热、出汗、清洁用品或衣物刺激，都可能让部分孩子更难受，具体诱因因人而异。',
      '因此，“吃过某样东西后变红”可以作为线索记录，却不能只凭这一次先后关系认定食物过敏。怀疑食物有关时，带上经过询问医生，不要自行扩大忌口范围，也不要在家试吃验证。'
    ] },
    { title: '把“又严重了”换成能看懂的经过。', paragraphs: [
      '记录不必复杂，下次出现变化时，可以顺手补上这几项：'
    ], items: [
      '位置和样子：脸颊、颈部还是关节弯曲处？有没有干裂、抓痕或渗液？拍一张近照，再拍一张能看清部位的照片，记下拍摄时间。',
      '痒到什么程度：偶尔摸一摸，还是反复抓挠、影响玩耍？夜里有没有痒醒、需要家长安抚？比单写“很痒”更容易说明影响。',
      '变化与照护：什么时候开始，之前是否明显出汗、换过清洁用品？用了什么保湿品或医生安排的外用药，之后有什么变化？记不清就写不确定。'
    ] },
    { paragraphs: [
      '这些记录是帮助沟通的办法，不是自行判定病因的测试。即使已经认真照护，湿疹也可能反复，不必把每次发作都理解为自己没照顾好。'
    ] },
    { title: '外观变淡后，日常照护仍有用。', paragraphs: [
      '温和清洁、洗后及时保湿，是湿疹照护的基础。皮疹好转后，仍应继续适合孩子的日常保湿。保湿与处方治疗承担不同作用；药用在哪、用多久，按医生给这个孩子的方案执行。',
      '复诊时可以问：“目前主要是干燥，还是炎症没有控制好？”“哪些变化出现时需要提前就诊？”把照片、抓痒和夜醒的经过放在一起，比只说“反反复复”更便于沟通。'
    ] },
    { title: '有这些变化，别只等着观察。', paragraphs: [
      '如果皮肤突然明显恶化、出现水疱或脓疱、渗液，或伴有疼痛、发热、精神不佳，应尽快就医评估感染等问题，不要为了凑齐记录而延误。'
    ] }
  ],
  sources: [
    { title: 'Eczema in Babies and Children: Symptoms and Causes', organization: '美国儿科学会', url: 'https://www.healthychildren.org/English/health-issues/conditions/skin/Pages/Eczema.aspx', checkedAt: '2026-10-18' },
    { title: 'How to Treat & Control Eczema (Atopic Dermatitis) Rashes in Children', organization: '美国儿科学会', url: 'https://www.healthychildren.org/English/health-issues/conditions/skin/Pages/how-to-treat-and-control-eczema-rashes-in-children.aspx', checkedAt: '2026-10-18' },
    { title: 'Atopic eczema', organization: '英国国家医疗服务体系 · NHS', url: 'https://www.nhs.uk/conditions/atopic-eczema/', checkedAt: '2026-10-18' }
  ]
}]
