import { RouterProvider } from 'react-router-dom'
import { SettingsEffects } from '../components/settings'
import { router } from './router'

export function App() {
  return <><SettingsEffects /><RouterProvider router={router} /></>
}
