import { formatChildAge } from '../features/children/childAge'

export function formatAgeFromBirthday(birthday: string, today = new Date()) {
  return formatChildAge(birthday, today).replace('年龄未填写', '未填写年龄')
}
