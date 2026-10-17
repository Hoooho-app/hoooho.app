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
}]
