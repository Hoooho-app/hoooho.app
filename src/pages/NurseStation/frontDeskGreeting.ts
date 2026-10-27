export function frontDeskGreeting(name: string, gender?: string) {
  const subject = name.trim() || '当前对象'
  const pronoun = gender === 'female' ? '她' : gender === 'male' ? '他' : 'TA'
  return `我是${subject}的档案员，${pronoun}的任何情况我都能帮助整理。`
}
