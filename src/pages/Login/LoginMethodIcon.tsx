import { MaterialIcon } from '../../components/icons'
import { ProviderBrandIcon } from '../../components/icons/ProviderBrandIcon'
type LoginIcon = 'password' | 'email' | 'code' | 'apple'
const names = { password: 'lock', email: 'mail', code: 'chat' } as const
export function LoginMethodIcon({ name }: { name: LoginIcon }) {
  return name === 'apple' ? <ProviderBrandIcon provider="apple"/> : <MaterialIcon name={names[name]} size={24}/>
}
