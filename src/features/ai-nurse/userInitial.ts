const initials = ['阿A', '八B', '嚓C', '搭D', '蛾E', '发F', '噶G', '哈H', '击J', '喀K', '垃L', '妈M', '拿N', '噢O', '啪P', '期Q', '然R', '撒S', '塌T', '挖W', '昔X', '压Y', '匝Z']
const pinyin = new Intl.Collator('zh-CN-u-co-pinyin')

export function userInitial(name?: string | null) {
  const first = name?.trim().charAt(0) ?? ''
  if (/^[a-z]$/i.test(first)) return first.toUpperCase()
  if (/^\p{Script=Han}$/u.test(first)) {
    for (let index = initials.length - 1; index >= 0; index--) {
      if (pinyin.compare(first, initials[index][0]) >= 0) return initials[index][1]
    }
  }
  return 'U'
}
